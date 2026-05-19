# 联盟营销管理系统 (Affiliate Marketing Management System)

面向联盟营销服务团队的内部管理系统，覆盖跨境电商品牌客户的联盟推广全链路：
客户开发、合同签署、任务跟进、推广数据分析与联盟商资源管理。

## 技术栈

- **Next.js 15** App Router + React 19 + TypeScript
- **Tailwind CSS** 样式
- **Prisma** ORM + **SQLite**（可平滑迁移到 PostgreSQL）
- **JWT 会话**鉴权 + 邮箱注册（飞书 / Google 日历 / 邮件授权字段）
- **recharts** 图表 · **@dnd-kit** 看板拖拽 · **xlsx** Excel 导入导出
- **pdf-parse** 合同 PDF 文本提取 · **Claude API** 合同字段智能提取
  （在 `.env` 配置 `ANTHROPIC_API_KEY` 即启用，否则使用规则提取兜底）

## 功能模块

| 模块 | 路径 | 说明 |
|------|------|------|
| 工作台 | `/dashboard` | 全局指标、最近客户、紧急待办，含状态超时自动流转 |
| 客户管理 | `/customers` | 4 段式信息收集（基础信息 / 推广平台 / 历史推广 / 目标与预算）、多选级联筛选、对外信息收集链接、Excel 导入（字段映射确认）/ 导出 |
| 任务管理 | `/tasks` | Kanban 看板、任务详情含 取消 / 退回(理由) / 完成、转进行中 / 转待审核；客户会议预约任务支持结构化会议信息、自动发邀请 |
| 合同管理 | `/contracts` | 关联客户必从客户管理选取；AI / 规则提取合同字段；字段级审核（审核内容 / 审核意见 / 修改意见）；原文对照模式 |
| 提醒管理 | `/reminders` | 节点提醒、已读管理、按类型筛选 |
| 推广数据 BI | `/bi` | 销售看板、明细分页、上传含字段映射确认与错误指引、批次管理 |
| 联盟资源库 | `/affiliates` | 联盟商面板概览、列表 / 看板视图、Excel 导入 |
| 客户门户 | `/intake` 与 `/intake/[id]` | 无需登录的 4 段式信息收集表单 |
| 注册登录 | `/login` `/register` | 邮箱注册登录，注册时勾选飞书 / Google 日历 / 邮件授权 |

## 用户角色

- **Admin（管理员）**：全部功能，管理合同审核，可删除数据
- **User（普通员工）**：管理自己负责的客户 / 任务，查看资源库与 BI
- **Customer（客户）**：仅访问公开 `/intake` 表单，无需登录

## 自动化业务规则

- **客户进度自动流转**
  - 选择商务负责人 → 自动创建「客户会议预约」任务
  - 选择后端负责人 → 自动创建「Demo方案制定」任务（手动选截止日期）
  - 合同创建 → 客户进度 → 合同推进中；合同签署完成 → 客户进度 → 合同签署完成
  - Demo方案任务完成 → 客户进度 → Demo方案已完成
- **状态超时自动转「待定 / 未推进合作」**
  - Demo方案已完成 > 14 天未变动 → 推送商务负责人 + 转「待定」
  - 客户内部讨论中 > 7 天未变动 → 推送商务负责人 + 转「待定」
  - 待定 > 3 天 → 转「未推进合作」
- **会议预约联动**
  - 商务负责人填写时间 / 形式 / 地点 / 参会人后，提交即给参会人创建会议提醒，
    并触发邮件邀请 + 飞书 / Google 日历同步（已为对应授权的用户暴露 dispatch
    接口，可在 `src/lib/notify.ts` 中接入真实三方服务）

## 本地运行

```bash
npm install
npx prisma migrate dev   # 初始化数据库（自动执行 seed，写入演示数据）
npm run dev              # 启动开发服务器 http://localhost:3000
```

演示账号：

- 管理员：`admin@demo.com` / `admin123`
- 商务：`lily@demo.com` / `user123`
- 后端：`tom@demo.com` / `user123`
- 合同审核：`shallow@demo.com` / `user123`

## 上线部署

```bash
npm run build   # prisma generate + migrate deploy + next build
npm run start   # 启动生产服务器
```

**上线前请修改 `.env`：**

- `AUTH_SECRET` — 改为随机强密钥（`openssl rand -base64 32`）
- `DATABASE_URL` — 如需 PostgreSQL，改为 `postgresql://...` 并将
  `prisma/schema.prisma` 的 `provider` 改为 `postgresql`
- `NEXT_PUBLIC_APP_URL` — 改为正式域名（对外信息收集链接基于该域名）
- `ANTHROPIC_API_KEY`（可选）— 配置后合同字段提取走 Claude API；不配置则使用规则提取

上传的文件保存在项目根目录 `uploads/`，请确保部署环境该目录可持久化写入。

## 三方集成接入点

`src/lib/notify.ts` 中预留了两个 dispatch 函数：

- `dispatchEmail({ to, subject, body })` — 实现 SMTP / 邮件服务调用
- `dispatchCalendar({ userId, feishu, google, title, time })` — 实现飞书 / Google Calendar API 同步

用户在注册时勾选的授权状态保存于 `User.feishuAuth` / `googleAuth` / `emailAuth`，
notify 会按这些标志位调用对应渠道。
