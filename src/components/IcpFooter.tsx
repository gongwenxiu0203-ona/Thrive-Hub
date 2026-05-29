/**
 * ICP 备案号底栏 — 中国大陆备案合规
 * - ICP 备案：工信部要求，文字 + 跳转 https://beian.miit.gov.cn/
 * - 公安网安备案：公安部要求，警徽 + 文字 + 跳转 beian.mps.gov.cn
 *
 * 备案号通过环境变量配置，无需改代码即可上线/更新：
 *   NEXT_PUBLIC_ICP_BEIAN_NO  = 粤ICP备2026066858号        （工信部备案）
 *   NEXT_PUBLIC_MPS_BEIAN_NO  = 粤公网安备44030502000001号  （公安备案，未办理可留空）
 *   NEXT_PUBLIC_MPS_BEIAN_CODE = 44030502000001            （公安备案号去掉前缀和"号"，用于查询链接）
 */

const ICP_NO =
  process.env.NEXT_PUBLIC_ICP_BEIAN_NO || "粤ICP备2026066858号";
const MPS_NO = process.env.NEXT_PUBLIC_MPS_BEIAN_NO || "";
const MPS_CODE = process.env.NEXT_PUBLIC_MPS_BEIAN_CODE || "";

export function IcpFooter() {
  const mpsHref = MPS_CODE
    ? `https://beian.mps.gov.cn/#/query/webSearch?code=${MPS_CODE}`
    : "https://beian.mps.gov.cn/";

  return (
    <footer className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 flex justify-center gap-3 pb-2 text-xs text-slate-400">
      {/* 工信部 ICP 备案 */}
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noopener noreferrer"
        className="pointer-events-auto rounded-md bg-white/80 px-2 py-0.5 backdrop-blur-sm transition-colors hover:text-brand-600"
      >
        {ICP_NO}
      </a>

      {/* 公安网安备案（备案号下来后显示） */}
      {MPS_NO && (
        <a
          href={mpsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto flex items-center gap-1 rounded-md bg-white/80 px-2 py-0.5 backdrop-blur-sm transition-colors hover:text-brand-600"
        >
          {/* 警徽图标（简化版 SVG，正式可替换为公安部官方 PNG） */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path
              d="M12 2L4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3z"
              fill="#1E40AF"
              stroke="#dc2626"
              strokeWidth="1.2"
            />
            <text
              x="12"
              y="15"
              textAnchor="middle"
              fontSize="8"
              fontWeight="700"
              fill="#FBBF24"
            >
              ★
            </text>
          </svg>
          {MPS_NO}
        </a>
      )}
    </footer>
  );
}
