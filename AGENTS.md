# Thrive Hub — Codex 工作规范

## 项目简介

联盟营销管理系统（Next.js 15 全栈，SQLite/Prisma，PM2 部署于腾讯云）。

---

## ⚠️ 数据安全红线（最高优先级）

> **历史教训**：2026-05-19 因部署目录迁移时未复制数据库文件，导致所有业务数据永久丢失。
> 以下规则为强制执行，不得以任何理由绕过。

### 1. 涉及数据库 Schema 的修改

每当需要修改 `prisma/schema.prisma` 或创建迁移文件时，**必须在执行前**用中文告知用户：

```
🔴 数据库结构变更提醒

本次修改涉及以下 Schema 变更：
- [列出具体变更内容]

⚠️ 风险评估：
- [是否有 DROP TABLE / DROP COLUMN 等破坏性操作]
- [受影响的数据表和字段]
- [数据是否会被清空或丢失]

🔒 请确认后再继续：
回复"确认"后我才会执行此操作。
```

**必须等待用户明确回复"确认"或"是"后才能继续。**

### 2. 包含破坏性操作的迁移（最高警戒）

以下 SQL 关键词出现在迁移文件中时，视为"破坏性迁移"，必须**单独强调**：

- `DROP TABLE`
- `DROP COLUMN`
- `DELETE FROM`
- `TRUNCATE`
- `migrate reset`
- `db push --force-reset`

破坏性迁移提示格式：

```
🚨 高危操作警告 🚨

检测到以下破坏性 SQL 操作：
- [具体 SQL 语句]

这将导致：
- [X] 表的所有数据将被永久删除
- 此操作不可逆

✅ 系统将在执行前自动备份数据库
⏳ 备份完成后仍需您的授权才能继续

请明确回复"我已了解风险，确认执行"才能继续。
```

### 3. 部署到生产服务器前的检查清单

每次向服务器部署代码前，**必须**用中文列出并确认：

```
📋 部署前检查清单

代码变更：
- [列出本次 commit 的主要变更]

数据库变更：
- 是否有新的迁移文件？[是/否]
- 迁移内容：[列出迁移文件名和主要操作]
- 是否包含破坏性操作？[是/否]

备份状态：
- 最近一次备份时间：[查询 /root/www/backups/backup.log]
- 本次构建将自动备份（scripts/pre-migrate-backup.js）

⚠️ 请确认后再执行部署。
```

### 4. 禁止直接执行的命令

以下命令**永远不允许**在未获得用户明确授权的情况下执行：

- `prisma migrate reset`（会清空所有数据）
- `prisma db push --force-reset`（会清空所有数据）
- `DROP TABLE`、`DELETE FROM`（直接 SQL）
- 删除或覆盖 `*.db` 文件
- 移动项目目录而不备份数据库

### 5. 每次部署流程

服务器部署的正确顺序（不可跳过任何步骤）：

```bash
# 1. 确认本地构建通过
npm run build

# 2. 提交并推送代码
git add ... && git commit && git push

# 3. 服务器端（此命令已包含自动备份）
cd /root/www && git pull origin master && npm run build && pm2 restart thrive-hub

# 4. 验证服务运行正常
pm2 status thrive-hub
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
```

---

## 项目技术栈

- **框架**：Next.js 15（App Router，全栈）
- **数据库**：SQLite（Prisma ORM）
- **认证**：JWT（jose）+ httpOnly Cookie
- **部署**：PM2 on 腾讯云，路径 `/root/www`
- **备份**：每日 03:00 自动备份至 `/root/www/backups/`

## 环境配置

- 本地开发：`.env.development`（不提交 Git）
- 生产环境：`/root/www/.env`（服务器上直接编辑）
- 模板：`.env.example`

## SSH 连接

- 服务器：`159.75.220.179`
- 用户：`root`
- PM2 进程名：`thrive-hub`

## Windows 本地开发注意

- 使用 `npm.cmd` / `npx.cmd`（Bash 工具无法识别 Node）
- PowerShell 不支持 `&&`，用 `;if($?){...}` 替代
- Git 操作在 PowerShell 中执行

## 数据库备份

- 备份脚本：`/root/www/backup_db.sh`
- 备份目录：`/root/www/backups/`
- 备份日志：`/root/www/backups/backup.log`
- 保留策略：30 天
- 构建时备份：`scripts/pre-migrate-backup.js`（每次 build 自动执行）

---

# Codex 多 Agent 协作规则

## 1. 简单任务默认单 Agent

以下任务默认使用单 Agent 处理：

- 文案修改
- 单文件小修复
- 小样式调整
- 单个报错定位

## 2. 复杂任务默认多 Agent

满足以下任一条件时，主 Codex 应默认启用多 Agent 协作：

- 涉及前端 + 后端 + 数据库任意两项以上
- 涉及 Prisma schema 或 migration
- 涉及权限、鉴权、文件上传、合同、财务、分账、部署
- 涉及上线前审查或发布前检查
- 预计改动超过 5 个文件
- 用户要求完整功能开发、系统重构、跨模块改造

## 3. 默认多 Agent 角色

- 总控 Agent：由当前 Codex 担任，负责拆任务、分配边界、整合结果、最终判断
- 前端 Agent：负责页面、组件、交互、状态、响应式
- 后端 Agent：负责 Prisma、数据库、API、server actions、权限、业务逻辑
- 测试审查 Agent：负责 build、类型检查、权限风险、边界情况、回归检查
- 部署 Agent：仅当用户明确要求部署或上线时启用

## 4. 多 Agent 边界

- 不允许多个 Agent 无约束修改同一批文件
- 总控必须给每个 Agent 指定清楚的文件范围或职责范围
- 测试审查 Agent 默认不改代码，只报告问题
- 涉及数据库迁移时，必须先给方案，再执行
- 涉及部署时，必须先备份、再迁移、再构建、再重启
- 不允许自动 push 或部署，除非用户明确批准

## 5. 汇报要求

- 多 Agent 开始前，总控先说明启用原因和分工
- 各 Agent 完成后，总控汇总结果
- 最终必须报告修改文件、验证结果、剩余风险
