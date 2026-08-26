# 权限体系收敛 — 代码审查报告

审查日期：2026-08-12
审查范围：提示词一「权限体系收敛（消除三套并行机制）」的落地质量
审查方式：静态代码审查（未运行、未部署、未改代码）

---

## 一、结论

**本任务范围（middleware + 侧边栏收敛到细粒度 leaf 解析）已正确实现。**
统一解析器、粒度化路由守卫、别名移除计划、单元测试均到位，向后兼容保留。

发现 1 个**范围外关键残留**（动作级 API 仍是角色制）与若干小问题，见下文。

> ⚠️ 当前改动**全部未提交**（工作树 `M` / `??`）。未纳入 Git = 无备份、易丢失，请先按规范提交。

---

## 二、已完成项（符合预期）

| 项 | 状态 | 证据 |
|---|---|---|
| middleware 改为粒度解析 | ✅ | `src/middleware.ts:60,85` 调用 `resolveUserPermissionsMap` + `canAccessRoute`，不再按角色放行 |
| 侧边栏改为粒度过滤 | ✅ | `src/components/Sidebar.tsx:115-146` 按 leaf 过滤导航/回收站/管理员入口 |
| 权限接线完整 | ✅ | `src/components/AppShell.tsx:45-50` 透传服务端算好的 `permissions` |
| 统一解析器 | ✅ | `src/lib/permissionResolver.ts` canonical 优先、legacy 兜底、用户 > 角色DB > 默认值 |
| 路由守卫 | ✅ | `src/lib/routePermissions.ts` 全量 leaf 映射 + `permissionLanding` |
| 别名移除计划 | ✅ | `docs/permissions-legacy-alias-removal.md`（v1.3.0 才删，符合过渡设计） |
| 单元测试 | ✅ | `tests/unit/permission-resolver.test.ts` 覆盖默认值 / legacy 兜底 / canonical>NONE / 未知角色失败封闭 |

**红线达标**：`ADMIN` 全 MANAGE；`USER/BRAND/CHANNEL` 各有合理默认；`UNKNOWN` 角色 → `NONE`（失败封闭），满足「任何角色不被误判 NONE」。

---

## 三、问题清单（按严重度）

### 🔴 P1 — 动作级 API 仍是角色制（关键残留，超出本次范围但必须跟）

`src/lib/permissions.ts` 的 `isStaff` / `canDeleteCustomer` **角色判断仍在约 96 处使用**（API 路由与页面）。
本次只收了 middleware + 侧边栏，**动作级（API / Server Action）鉴权仍是角色制**。

风险：管理员把某 `USER` 的某 leaf 覆盖为 `NONE` 后，侧边栏隐藏、middleware 拦 URL，
但该用户仍可**直接调用**这些 API（因 `isStaff` 只看角色不看 leaf）：

- `src/app/api/contracts/signature/route.ts:17`
- `src/app/api/contracts/seal/[company]/route.ts:20`
- `src/app/api/sales/export/route.ts:30`（`isStaff ? "all" : "mine"` → 越权看全量）
- `src/app/api/sales/clear/route.ts:53`
- `src/app/api/invoices/[id]/pdf/route.ts:46`

这正是 `HANDOVER` 所述「action-level enforcement 需逐模块迁移」。建议下一步把这些 `isStaff`
改为 `hasPermission(leaf, ...)`。详见同目录 `CODEX-PROMPT-isstaff-migration.md`。

### 🟠 P2 — 未提交 / 未备份（流程风险）

当前改动未提交：`permissionResolver.ts`、`Sidebar.tsx`、`middleware.ts` 为已修改未提交；
`routePermissions.ts` 为新增未跟踪。请按项目规范 `git add` 显式文件后提交；上线须走
「停 PM2 → 构建 → 重启」runbook，且**不可代你部署**。

### 🟡 P3 — 重复代码行（顺手可修）

`src/lib/permissionResolver.ts:36-37` 有完全重复的一行：

```36:37:src/lib/permissionResolver.ts
  if (!FEATURE_BY_KEY.has(canonicalFeature)) return "NONE";
  if (!FEATURE_BY_KEY.has(canonicalFeature)) return "NONE";
```

删掉其一即可，无功能影响。

### 🟡 P4 — `/admin` 落地过宽（需验证，非本次引入）

`src/lib/routePermissions.ts:89-93`：`/admin` 用 `mode:"any"` 且含 `intake.review`，
意味着**仅持有 `intake.review` 的用户能进入 `/admin` 根路径**。
请确认 `/admin` 页面内部按 tab 做了 leaf 级拦截，否则可见无权限的管理页签。属既存行为，未因本次变更恶化。

### ⚪ P5 — 性能（低优先）

`src/middleware.ts` 每次非 API 请求跑 `resolveUserPermissionsMap`（user + overrides + roleSettings 共 3 次查库），
含登录跳转。当前量可接受，后续可考虑把权限 map 写入会话或短缓存。

---

## 四、测试覆盖评估

- 单测覆盖**解析器纯函数**核心路径（默认值、legacy 兜底、canonical 覆盖 NONE、非法 level 兜底、
  未知角色失败封闭、落地页恒可达），质量合格。
- 缺口：未覆盖「用户 override > 角色 DB」显式用例（逻辑上已被 test3 间接覆盖）；
  DB 支撑的 `resolveUserPermissionsMap` 无单测（需 DB，可接受）。
- **23/23 安全测试是否仍全绿未在本机验证**，提交前请跑 `npm run test:security`。

---

## 五、建议后续（按优先级）

1. 提交并备份当前权限改动（P2）
2. 删重复行（P3）
3. 迁移 API/Server Action 的 `isStaff` → leaf 鉴权（P1，见 `CODEX-PROMPT-isstaff-migration.md`）
4. 验证 `/admin` tab 级拦截（P4）
5. 跑 `test:security` 确认无回归
