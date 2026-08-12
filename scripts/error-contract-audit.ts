import { execFileSync } from "node:child_process";

const API_ROUTE = /src\/app\/api\/.*\/route\.ts$/;
const violations: string[] = [];

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).replace(/\\/g, "/");
}

function auditAddedSource(label: string, source: string): void {
  const added = source
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");

  if (!added.trim()) return;

  const leakingMessage = /error\s*:\s*(?:(?:error|err|e)\s+instanceof\s+Error\s*\?\s*(?:error|err|e)\.message|(?:error|err|e)\.message)|`[^`]*\$\{(?:error|err|e)\.message\}/;
  const englishAuth = /error\s*:\s*["'](?:Unauthorized|Forbidden|Not found)["']/;
  const vague500 = /NextResponse\.json\s*\(\s*\{[\s\S]{0,300}?error\s*:\s*["'][^"']*(?:操作|创建|更新|删除|恢复|提交|保存|上传|下载|生成|拉取|推送|请求|提取)?失败[^"']*["'][\s\S]{0,200}?status\s*:\s*500/;

  if (leakingMessage.test(added)) violations.push(`${label}: 未知异常直接向客户端返回了普通 Error.message`);
  if (englishAuth.test(added)) violations.push(`${label}: 鉴权/不存在错误必须使用明确中文原因`);
  if (vague500.test(added)) violations.push(`${label}: 模糊 500 必须改用 errorResponse 生成错误代码`);
}

const diff = git(["diff", "HEAD", "--unified=12", "--", "src/app/api"]);
let current = "";
let chunk: string[] = [];
for (const line of diff.split(/\r?\n/)) {
  if (line.startsWith("diff --git ")) {
    if (current && API_ROUTE.test(current)) auditAddedSource(current, chunk.join("\n"));
    const match = line.match(/ b\/(.+)$/);
    current = match?.[1] ?? "";
    chunk = [line];
  } else {
    chunk.push(line);
  }
}
if (current && API_ROUTE.test(current)) auditAddedSource(current, chunk.join("\n"));

const untracked = git(["ls-files", "--others", "--exclude-standard", "--", "src/app/api"])
  .split(/\r?\n/)
  .filter((file) => API_ROUTE.test(file));
for (const file of untracked) {
  const source = execFileSync(process.execPath, ["-e", `process.stdout.write(require('fs').readFileSync(${JSON.stringify(file)}, 'utf8').split(/\\r?\\n/).map(l => '+' + l).join('\\n'))`], { encoding: "utf8" });
  auditAddedSource(file, source);
}

if (violations.length) {
  console.error("错误契约审计失败：");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log("错误契约审计通过：新增 API 响应未发现内部 message 泄露、英文鉴权或模糊 500。");
}
