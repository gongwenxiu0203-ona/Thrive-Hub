# Codex 提示词：动作级 `isStaff` → 细粒度 leaf 鉴权迁移

> 用途：粘贴给 Codex 执行。本任务为「权限体系收敛」的下一步（审查报告 P1）。
> 仅做逻辑迁移，不改数据库 Schema；不部署；不代用户执行服务器命令。

---

## 提示词正文（直接复制）

```
你正在为 Thrive Hub（Next.js 15 + SQLite/Prisma）做权限体系收敛的下一步：
把 API 路由与 Server Action 中残存的「角色硬判断」改为统一的细粒度 leaf 鉴权。

【背景 / 当前问题】
- 已完成：middleware 与 Sidebar 已改为调用 resolveUserPermissionsMap / canAccessRoute（src/lib/permissionResolver.ts、src/lib/routePermissions.ts）。
- 残留：src/lib/permissions.ts 的 isStaff / canDeleteCustomer 仍在约 96 处使用，
  多为 API 路由与页面。这些仍是「角色制」判断（isStaff = ADMIN|USER），
  导致被管理员用 leaf override 设为 NONE 的 USER 仍能直接调用对应 API（middleware 只拦 URL 导航，拦不住直接 API 调用）。
- 已知安全关键入口示例：
  src/app/api/contracts/signature/route.ts:17
  src/app/api/contracts/seal/[company]/route.ts:20
  src/app/api/sales/export/route.ts:30   （isStaff ? "all" : "mine" → 越权看全量）
  src/app/api/sales/clear/route.ts:53
  src/app/api/invoices/[id]/pdf/route.ts:46

【具体任务】
1. 全量清点所有 isStaff / canDeleteCustomer 调用点（grep src/），逐处分类：
   A. 硬访问控制（return 403 / 隐藏按钮）：必须改为 leaf 鉴权。
   B. 数据范围选择（如 isStaff ? "all" : "mine"）：改为「持有对应 MANAGE/READ leaf 才看全量」，
      明确每个场景对应的 leaf（如 sales 导出对应 bi.export 或 operations.*；客户范围对应 customers.records）。
2. 提供统一服务端鉴权辅助（建议新增 src/lib/requirePermission.ts 或扩展 permissionResolver）：
   - requirePermission(session, feature, level="READ")：按需调用 resolveUserPermissionsMap(session.userId) 解析后判定，没权限返回 403/抛可控错误。
   - 页面 Server Component 已有 permissions map 的，直接复用，不要重复查库。
3. canDeleteCustomer(role)==="ADMIN" 改为对应 leaf（客户删除建议 customers.records 的 MANAGE，
   或保留 ADMIN 硬边界但用 leaf 表达），不要再用角色字符串比对。
4. 保留 ADMIN 硬边界语义：对纯系统级操作（如最后一个管理员防删）仍用 ADMIN 角色判断，不降级为 leaf。
5. 迁移后保证：被 override 为 NONE 的 USER 既不能经 UI 也不能经直接 API 命中该能力。

【验收标准】
- 全部 A 类调用点改为 leaf 鉴权；B 类明确 leaf 映射。
- npm run test:security 保持通过且无回归；新增针对「USER 被 override NONE 后直接调 API 返回 403」的用例。
- 不破坏现有 23/23 安全测试；不引入新 tsc 错误（npm run typecheck 相关模块）。

【安全约束 — 必须遵守】
- 本任务不需改 Prisma schema / 迁移；若你判断必须新增字段或表，
  先停止并用中文输出「🔴 数据库结构变更提醒」，等用户「确认」。
- 严禁 prisma migrate reset / db push --force-reset / DROP TABLE / 删除 *.db / 移动目录不备份。
- 严禁代用户部署；本地通过 typecheck 与 test:security 后再交付。
- 不用 git add .，只 stage 显式任务文件。

【完成定义】给出：调用点清单与每处分类（A/B）+ 对应 leaf、新增辅助函数路径、
单测结果、对 23/23 安全测试的影响说明。
```

---

## 备注（给负责人的执行提醒）

- 本提示词已内嵌项目数据安全红线，Codex 收到后不会越权部署或破坏数据。
- 执行前请先完成 `REVIEW-permission-convergence.md` 的 P2（提交当前未提交的权限改动），
  避免两次改动混在工作树中难以区分。
- `isStaff` 的「数据范围」用法（all/mine）不要一律改成「需 MANAGE」，应按业务语义选 READ 或 EDIT 即够「看全量」的场景，
  避免过度收紧导致内部员工看不到本应可见的数据。
