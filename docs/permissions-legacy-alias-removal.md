# 旧权限键移除计划

当前 `v1.2.x` 是唯一兼容过渡版本。所有新代码、路由和权限管理写入只使用
canonical leaf；解析器仍可读取旧的粗粒度数据库行，且 canonical 行优先。

| 旧键 | 过渡期覆盖的新 leaf |
| --- | --- |
| `dashboard` | `dashboard.view` |
| `customers` | `customers.records`, `customers.followup` |
| `contracts` | `contracts.records`, `contracts.create_upload`, `contracts.reviews`, `contracts.templates`, `contracts.signing` |
| `tasks` | `projects.records`, `projects.kpi`, `tasks.board`, `worklogs.records` |
| `bi` | `bi.view`, `bi.import`, `bi.export`, `bi.manage` |
| `affiliates` | `affiliates.records`, `affiliates.reviews`, `affiliates.batches`, `affiliates.media` |
| `finance_customer` | `finance.customer_reconciliation`, `operations.revenue`, `operations.customer_count`, `operations.accounts_receivable`, `operations.invoices`, `operations.sales_pipeline`, `operations.employee_kpi` |
| `finance_channel` | `finance.channel_reconciliation`, `finance.affiliate_reconciliation` |
| `reminders` | `reminders.records` |
| `intake` | `intake.links`, `intake.review` |
| `admin` | `admin.users`, `admin.registration_review`, `admin.permissions`, `admin.data_quality`, `admin.audit`, `admin.api_access` |

## v1.2.x 过渡规则

1. 读取顺序：用户 leaf → 用户旧键 → 角色 leaf → 角色旧键 → 角色默认值。
2. 新增或修改权限时只写 leaf，不再产生旧键记录。
3. 迁移旧行时复制到对应 leaf，已存在的 leaf 绝不覆盖。
4. 只做统计审计，不在本版本删除旧行；旧键命中数为 0 后才进入下一版本。

## v1.3.0 删除项

- 删除 `LEGACY_FEATURE_ALIASES`。
- 删除 `FeatureDefinition.legacyKey`。
- 删除解析器对旧数据库行的 fallback。
- 管理 API 拒绝任何不在 `FEATURE_BY_KEY` 中的 feature key。

此计划不修改 Prisma Schema；若后续执行旧数据复制，需另行作为有审计记录的
数据迁移处理。
