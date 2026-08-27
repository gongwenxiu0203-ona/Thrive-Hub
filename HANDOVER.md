# Thrive Hub Handover

## 2026-08-27 合同新建入口收紧为三类（本地未提交）

- 新建合同首页仅保留品牌方合同、渠道商返佣合同、事务性合同三个入口；品牌方合同再进入“新建合同 / 上传已有合同”二级选择。
- 品牌方新建和上传已有合同在前端只读显示品牌方合同，服务端固定写入 `BRAND`；渠道商返佣继续使用 `CHANNEL` 归档流程；事务性合同继续使用 `TRANSACTIONAL`。
- 渠道商返佣上传选择客户后，通过 `Customer.channelUserId` 带出已审核的渠道商账户名称和邮箱；未新增重复关联字段。
- 历史 `REBATE` 数据不转换、不删除，列表筛选时归入“渠道商返佣合同”，详情标注为历史记录，避免出现第四个新建类型。
- 未修改 Prisma Schema 或迁移；TypeScript 与 `git diff --check` 通过，本地 `/contracts/new` HTTP 200。尚未 commit/push/deploy。

## 2026-08-27 已删除合同/Invoice 编号释放（未提交）

- 编号规则统一为：活动记录和作废记录继续占用编号；`deletedAt != null` 的软删除记录释放原编号。
- 合同或草稿 Invoice 删除时，数据库内部编号改为包含类型与记录 ID 的墓碑编号，原业务编号可立即再次使用；审计仍保存删除前的原编号。
- 为兼容历史软删除数据，新建/手工上传或管理员改号若命中已删除记录，会在同一事务中先归档旧编号再使用；若命中活动或作废记录仍拒绝重复。
- 合同与 Invoice 自动编号计算忽略软删除记录。未改 Prisma Schema，无迁移、无批量数据转换。

## 2026-08-27 手工 Invoice 归档、应收补建与客户对账关联（未提交）

- Invoice 列表新增“上传 Invoice”：仅填写唯一编号、客户、合同并上传原件；记录标记为 `archiveOnly/MANUAL_UPLOAD`，状态为已开具，但不会自动创建应收账款。
- 手工归档 Invoice 可在列表点击“创建应收”，补录金额、币种、到期日、汇率和备注后生成应收；缺少必要字段时由弹窗收集，不允许静默使用占位金额。
- 已确认客户对账可从同客户、同合同的已开票 Invoice/国内发票中手动关联；关联后沿用开票/收款状态回传，并可下载生成 PDF、国内发票原件或手工上传的 Invoice 原件。
- Schema 纯新增 `Invoice.originalFileUrl/archiveOnly/archiveSource`；迁移 `20260827173000_invoice_manual_archive` 已在本地成功应用，无破坏性 SQL。
- 本轮关联文件：`src/actions/invoiceArchive.ts`、Invoice 列表/页面、客户对账详情、`reconciliationInvoice.ts`、`attachmentAccess.ts`。

## 2026-08-25 manual reconciliation plan and completed-record deletion (local only)

- Manual customer reconciliation creation now defaults to both fixed-fee and sales-commission streams. Selecting a completed contract pre-fills its start/end dates, and one submission creates the same complete period plan used by automatic contract completion: inclusive 30-day fixed-fee periods and first-partial-month/subsequent-calendar-month commission periods.
- Creation is atomic after preflight overlap checks: any overlap in either selected stream rejects the whole request, so the UI cannot leave a half-created plan.
- Completed customer reconciliations can be soft-deleted only by an ADMIN with a required reason. The action writes `FinanceAuditLog`; confirmed or settled deleted records are excluded from the seven-day physical trash cleanup and remain recoverable/auditable.
- Completed or paid channel reconciliations can likewise be soft-deleted only by an ADMIN with the existing required reason; payment and period history is retained.
- No Prisma schema or migration change. Customer-plan boundary tests, full TypeScript, scoped diff check and local browser QA passed. No customer/channel record was created or deleted during QA. Not committed, pushed, or deployed.

## 2026-08-24 finance workbench information architecture follow-up (local only)

- `/finance/workbench` now has two top-level areas: `财务工作台` for billing queues, receivables and channel payments; `财务流程` for initiating ordinary billing, supplier payments, expenses and maintaining billing profiles.
- The ordinary billing form no longer asks for a free-form invoice-content field. Its stored description is derived from the selected fee type.
- Selecting a customer limits the contract selector to that customer. Selecting a contract loads promotion-platform, target-site and affiliate-platform options from the contract and preselects the first available value.
- No Prisma schema or migration change. TypeScript and diff checks passed; browser QA confirmed the two-area switch and the contract-driven dropdowns. Local `/finance/workbench` returned HTTP 200.
- The top-level order is now `财务流程` on the left and `财务工作台` on the right. Invoice billing queue actions navigate to the existing Invoice editor with `focus=invoice`; AppShell hides the sidebar/topbar only in this focus mode while preserving the editor's form/real-time-preview split layout. Domestic billing keeps its dedicated flow.
- `财务流程` now opens as a four-module launcher: `财务收款` (billing request), `出纳付款` (payment request), `费用报销`, and `财务资料汇总`. Each module opens its own focused form with a return-to-modules action. The data-summary module lists saved customer billing profiles and contract-configured receiving accounts, then provides the add-profile form. No schema change; browser QA covered launcher, form entry/return, customer selection and empty account states.
- Billing, payment and expense flow pages now include `我的申请与审批进度`. Billing shows submitted → finance accepted → issued; payment/expense show submitted → finance approved → paid, with rejected status and rejection reason. Non-admin payment/expense queries are constrained to applicant/employee ID, billing flow rows are filtered to the applicant, and admins retain the all-record approval view. No schema change; TypeScript/diff checks and browser QA passed.

## 2026-08-21 domestic invoice OCR and fixed-fee review follow-up (local only)

- Domestic invoice file selection now extracts PDF text or runs local Tesseract OCR for images/scanned PDFs, pre-fills invoice number/code/type/date/tax-inclusive/net/tax/rate fields, and keeps manual correction available.
- Finance workbench administrators can audit-soft-delete billing requests at every stage; accepted/completed records require a reason, linked invoices are voided/soft-hidden, and finance audit history is retained.
- New customer reconciliation records canonicalize currencies to USD/CNY and default to USD when no contract currency exists. Customer and channel entry controls accept other ISO currency codes.
- Draft/disputed fixed-fee reconciliations support multi-select batch amount/currency edits. Fixed-fee review defaults to no dispute but supports a distinct disputed amount; `finalFeeAmount` drives confirmed settlements without overwriting the original contract snapshot amount.
- Additive migration `20260821170000_fixed_fee_dispute_amount` adds nullable `CustomerReconciliation.finalFeeAmount` and `ReconciliationReview.disputedFeeAmount`; no DROP/DELETE/TRUNCATE. Backup: `backups/local-before-fixed-fee-dispute-20260821/dev-before-fixed-fee-dispute.db`.
- Validation: 64 migrations current, SQLite integrity `ok`, TypeScript and diff check passed, invoice parser sample passed, and browser QA passed for domestic form, administrator delete-reason modal, and fixed-fee batch edit modal. No commit, push, or deployment.

## 2026-08-21 local finance workflow implementation (not committed or deployed)

- Implemented idempotent customer reconciliation plans when a customer contract reaches `COMPLETED`: fixed-fee periods are consecutive inclusive 30-day periods; commission periods run from contract start to the first month-end, then by calendar month, with the last period truncated at contract end. Manual creation and audited period adjustment remain supported.
- Preserved the existing customer reconciliation two-column fixed-fee / sales-commission UI and commission BI, dispute, skip-confirmation, and final-lock workflow. Multi-select now submits an Invoice/domestic-invoice billing request instead of opening Invoice directly.
- Added the finance billing queue, Invoice request prefill, domestic-invoice registration/original upload and archive, customer receipt allocation, receivable status aggregation, channel payable release, channel business-document review, stream-specific channel payments, and a finance workbench.
- Preserved the existing channel fixed-fee and commission waterfall columns. New document, finance-review, payable, and paid-amount information is shown inside each stream.
- Additive migrations: `20260821100000_finance_workflow` and `20260821103000_channel_finance_streams`. They contain no `DROP TABLE`, `DROP COLUMN`, `DELETE FROM`, or `TRUNCATE`. Local pre-change backup: `backups/local-before-finance-workflow-20260821/dev-before-finance-workflow.db`.
- Local DB verification: 63 migrations current, `PRAGMA integrity_check = ok`, foreign-key check returned zero rows. Build backups also include `dev_pre_deploy_20260821_115048.db`.
- Validation passed: full TypeScript, customer-period boundary tests, 26/26 isolated security tests, `git diff --check`, and final Next.js production build. The final clean build completed successfully after stopping the local port-3001 Next process that held Prisma's Windows DLL.
- Browser QA confirmed `/finance`, the customer fixed-fee/commission columns, multi-select `提交开票申请`, the channel fixed-fee/commission waterfalls, `/finance/billing`, and `/finance/workbench` render without console errors. Final local dev server is running on `http://127.0.0.1:3001`.
- No commit, push, or production deployment has been performed. Production deployment requires the AGENTS.md checklist, verified backup, PM2 stop before build, and explicit user confirmation.

## 2026-08-13 invoice PDF Chinese garble fix deployed

- Commit `11b2ce8` (`fix(invoice): 修复发票 PDF 中文乱码`) was pushed to `origin/master` and deployed to production `/root/www`.
- Change: `src/lib/invoicePdf.ts` now embeds `SourceHanSansCN-Regular.otf` as a base64 data URI inside the SVG `@font-face` instead of referencing it via a `file://` URL. This lets `sharp`/`librsvg` reliably load the CJK font during SVG→PNG rasterization, eliminating the Chinese tofu/garbled text in invoice PDFs. The font data is consumed only during rasterization and does not bloat the final PDF.
- No Prisma schema or migration change. The build ran `pre-migrate-backup` + `prisma migrate deploy` with no pending migration.
- Deployment sequence followed the runbook: latest scheduled backup `dev_daily_20260813_030001.db` (integrity ok); `git pull` fast-forwarded to `11b2ce8`; `pm2 stop thrive-hub` (SQLite released); `npm run build` succeeded; `pm2 restart thrive-hub --update-env` online (pid 3718198); `/login` returns HTTP 200.
- Local verification before push: generated a Chinese-content invoice PDF with `generateInvoicePdf`, rasterized to PNG, and visually confirmed Chinese client name/address/line items/terms render correctly (no tofu/garbled). `tsc` showed no new errors in the changed file.

## 2026-08-10 customer reconciliation and Invoice release

- Commit `90c293b` (`Add customer reconciliation invoice workflow`) was pushed to `origin/master` and deployed to production `/root/www`.
- Production build backup: `backups/dev_pre_deploy_20260810_133329.db`; the prior scheduled backup `dev_daily_20260810_030001.db` also had integrity `ok`.
- Additive migrations `20260807151000_invoice_reconciliation_links` and `20260807175000_invoice_item_currency_period` were applied successfully. They create the reconciliation/Invoice link table and add/backfill line-level Invoice currency and period fields; no DROP, DELETE, or TRUNCATE is present.
- Post-migration verification: 60 migrations current, SQLite `PRAGMA integrity_check` = `ok`, `PRAGMA foreign_key_check` returned no rows, and production had zero existing `InvoiceItem` rows to backfill.
- PM2 `thrive-hub` is online at commit `90c293b`; `/login` returns HTTP 200 and protected `/invoices/new` and `/finance` return the expected unauthenticated HTTP 307 redirect.
- The production error log was last modified at 04:31, before the 13:38 deployment restart, so no fresh startup error was observed.

Last updated: 2026-08-10 (Asia/Shanghai)

## 2026-08-06 current production and repository state

- Workspace: `C:\Users\17863\Desktop\claude-workspace`; branch: `master`.
- Local `HEAD`, GitHub `origin/master`, and production `/root/www` all point to
  `0dda30d Add public security registration footer`.
- Production PM2 process `thrive-hub` is `online`; `http://localhost:3000/login`
  returns HTTP 200.
- Latest verified scheduled backup:
  `backups/dev_daily_20260806_030001.db`, 203,776,000 bytes, integrity `ok`.
- The working tree intentionally retains unrelated local-only files, including
  `.claude/settings.local.json`, `.impeccable/`, `DESIGN.md`, `PRODUCT.md`,
  `output/`, this untracked `HANDOVER.md`, and the root Chinese-named text file.
  Continue to stage explicit task files only; never use `git add .`.

### Recently completed and deployed work

- `9e60d40`, `3f2fb5f`, and `26e5b48` implement the channel-split payment and
  review workflow, independent fixed-fee/commission waterfall operations, and
  administrator deletion of legacy channel reconciliation records.
- `bc44901` adds contract-level channel split rules with customer-level rules
  taking precedence and contract rules serving as fallback.
- `974f3b3` raises the application contract-file limit to 100 MB, keeps failed
  selections in the UI, improves 413/timeout/proxy errors, and sends scanned
  PDFs without a text layer directly to manual supplementation. OCR is not
  used for this flow.
- `cd839e8` raises Next.js `middlewareClientMaxBodySize` and Server Action body
  limits to 110 MB. This fixes production truncation at the former 10 MB
  middleware limit. Nginx is configured with `client_max_body_size 110M` and
  300-second proxy read/send timeouts.
- `e228a2c` displays separate contract start and end date columns after type and
  before owner on the contract list; missing dates render as an em dash.
- `0dda30d` adds the official public-security registration icon and footer link
  for `粤公网安备44060602003309号` using query code `44060602003309`.
- The latest footer, contract-list, and large-upload changes add no Prisma
  schema change or migration. Local TypeScript checks and production builds
  passed before each push; the latest footer build passed on 2026-08-06.

### Known issue / next action

- An unauthenticated request to `/beian-icon.png` currently returns HTTP 307
  because middleware redirects the public static asset to login. Authenticated
  application pages send the session cookie, but the icon may be broken on the
  login and other public pages. The next code change should exempt
  `/beian-icon.png` (or a dedicated public-assets path) from authentication,
  then verify the icon returns HTTP 200 without a session and still links to
  the official MPS query URL.
- Manual acceptance is still recommended for the 86.9 MB scanned SupplySync
  contract: upload it in production and confirm the flow reaches the manual
  supplementation page without OCR or a FormData parsing error.

> Status note: sections below this point are retained as point-in-time history.
> Where an older section says "uncommitted", "unpushed", or "not deployed",
> the verified 2026-08-06 state above takes precedence.

## 2026-07-30 channel split actual-income workflow (historical snapshot)

- Channel reconciliation creation is now customer-driven: select one active
  customer and a start month; the server resolves the approved channel user
  and customer split rule and generates monthly periods through the rule end
  date. Contract and customer-reconciliation links are no longer accepted for
  new records.
- New `RULE_DRIVEN` records are limited to one per customer by both a
  transaction check and a partial SQLite unique index. Existing records default
  to `LEGACY` and remain readable.
- A rules use monthly Thraive actual commission received: below USD 4,400 is
  15%; USD 4,400 or above is 25%. B rules retain the existing progressive GMV
  calculation.
- Detail pages show separate fixed-fee and commission waterfall streams.
  Every period can be entered or corrected manually; the server recalculates
  rates and amounts and appends actor/time/reason/before/after audit snapshots.
- Migration `20260730150000_channel_split_actual_income` is additive only. It
  was applied locally after backup and database integrity remained `ok`.
- Local verification passed: Prisma validate/status, TypeScript, A boundary
  and B tier checks, 23/23 isolated security tests, and production build. Build
  backup: `backups/dev_pre_deploy_20260730_142306.db`.
- This change set is not committed, pushed, or deployed.

### 2026-07-30 service-cycle and payment follow-up

- New records once again require a completed, active customer contract. A
  single contract is selected automatically; multiple contracts require a
  manual choice. The split start defaults to contract start and remains
  editable.
- Fixed-fee periods are consecutive 30-day service periods; commission periods
  follow calendar months. `streamType` separates both waterfalls while old
  rows default to `BOTH`.
- Fixed and commission currencies are selected once at creation and then
  remain fixed. Fixed currency defaults from the contract; legacy Chinese
  currency labels are normalized. A rules reject a commission currency that
  differs from the USD threshold currency because no exchange rate is stored.
- First entry automatically audits as `首次录入`; corrections require a reason.
  A channel payment date permanently locks that side of the period and shows
  an `已付款` stamp.
- Channel payee details are stored as a validated JSON snapshot on the master
  record and displayed at the top of the detail page.
- Additive migration `20260730170000_channel_split_service_periods` was applied
  locally after backup. Integrity remained `ok`; 53 migrations are current.
- TypeScript, Prisma validation, period-boundary checks and production build
  passed. Security assertions passed 23/23; the runner returned non-zero only
  while deleting its disposable SQLite `-shm` file on Windows.
- Local production-mode test server is running on port 3001. No commit, push,
  or production deployment has occurred.

## 2026-07-27 granular permission rollout

- The 38-leaf permission catalog is now enforced across navigation, pages,
  server actions, and APIs for customers, contracts, projects/KPI, tasks,
  worklogs, BI, affiliates, finance, operations, Invoice, reminders, intake,
  and administrator functions.
- Permission resolution now prefers canonical leaf rows over legacy rows and
  validates persisted permission levels. Legacy module keys remain fallback
  compatibility only.
- Sidebar, Topbar, Admin tabs, Finance tabs, Operations tabs, customer actions,
  project KPI, reminders, and dashboard summaries hide or disable controls
  according to READ/EDIT/MANAGE. Server-side page guards prevent direct URL
  access and avoid loading unauthorized tab/detail data.
- Finance customer/channel/affiliate reconciliation pages and APIs use their
  dedicated leaves and retain row-level scopes. BI import/export/manage and
  affiliate records/reviews/batches/media are independently enforced.
- Administrator functions retain the ADMIN role hard boundary and add
  per-leaf enforcement. Last permission-admin protections prevent disabling or
  deleting the final active administrator capable of managing permissions.
- Reminder mutations now verify record ownership/scope instead of accepting an
  arbitrary record ID.
- No Prisma schema or migration was added for this permission rollout.
- Final local verification passed: TypeScript, `git diff --check`, all 23
  isolated security tests, and the production build. The build created local
  backup `backups/dev_pre_deploy_20260727_102638.db`; all 51 migrations were
  already applied and no pending migration was found.
- This permission change set remains uncommitted and unpushed. Local-only
  settings/design/output files must stay excluded from staging.

## 2026-07-24 active-record option filtering

- Database-backed option sources now consistently exclude soft-deleted
  customers, contracts, affiliates, projects, templates, and inactive users
  in the audited project, contract, customer, finance, affiliate, BI,
  operations, reminder, and work-log flows.
- High-risk submissions now re-check active references server-side for project
  creation/editing, tasks, accounts receivable, work logs, contract templates,
  and affiliate cooperation reviews. A stale page or forged payload cannot
  newly associate a soft-deleted record in these flows.
- No additional schema or migration was required for this filtering work.
- `npm.cmd run typecheck`, `git diff --check`, and `npm.cmd run build` pass.
  The security suite passes 20/23; the three failures are existing finance
  granular-permission expectation mismatches (403 returned where old tests
  expect 200/404), not soft-delete filtering regressions.

## 2026-07-24 permission-key compatibility fix

- ADMIN finance reconciliation requests were incorrectly denied because the
  permission catalog uses `finance.customer_reconciliation` while the shared
  reconciliation guard and bulk-delete route still requested the obsolete
  `finance_customer` key.
- Both customer-reconciliation delete paths now use the granular key, and the
  finance page shows management controls only when the resolved permission is
  `MANAGE`.
- `LEGACY_FEATURE_ALIASES` provides temporary reverse compatibility for older
  guards that still send module keys, preventing missing legacy DB rows from
  resolving every role (including ADMIN) to `NONE`.
- Permission audit result: the catalog has 38 leaves, but only the contract
  leaves and Invoice are currently close to end-to-end granular enforcement.
  Customers, projects, tasks/worklogs, BI, affiliates, channel/affiliate
  finance, operations, portals, and admin still mix granular keys, legacy
  module keys, and fixed role checks. Sidebar and middleware remain role-based.
- After the fix, TypeScript, diff check, production build, and all 23 isolated
  security tests pass.

## 2026-07-23 Invoice mixed-fee local implementation

- Invoice now supports line-level `MONTHLY_FEE` and `SALES_COMMISSION`, with
  the parent Invoice summary derived as `MONTHLY_FEE`, `SALES_COMMISSION`, or
  `MIXED`.
- Non-destructive migration `20260723173000_invoice_item_fee_type` adds
  `InvoiceItem.feeType`, preserves existing parent fee types, and adds an
  index. It was applied only to the backed-up local database.
- Invoice/due dates moved into the customer/contract heading section. Currency,
  fee period, and line items now share one form section; each line selects its
  own fee type.
- List labels, PDF line labels, and mixed-fee filenames support `MIXED`.
- `npm.cmd run typecheck`, `prisma validate`, migration application, and mixed
  PDF visual QA passed. A later `next build` exceeded the local tool timeout;
  no production deployment, commit, or push occurred.

## 2026-07-17 current local development state

- Workspace remains `C:\Users\17863\Desktop\claude-workspace` on `master`.
  Local and GitHub `master` both point to `922884f`. Commit `d6e42dd` protects
  local runtime/sensitive files, and `922884f` contains the scoped-access,
  TypeScript, security-test/CI, and frontend-foundation change set. Both were
  pushed to `origin/master` on 2026-07-20; production deployment has not yet
  been confirmed.
- The local change set covers scoped contract/attachment/finance/BI/affiliate
  access, TypeScript fixes and CI, isolated permission tests, and shared
  modal/button/mobile-shell UI infrastructure.
- `npm.cmd run typecheck` passes with zero errors.
- `npm.cmd run test:security` passes 23/23 using a disposable
  `security-test-*.db`; the runner rejects `prisma/dev.db` and production data.
  Coverage now includes contract version/attachment access, customer
  reconciliation and BI clear scope, Affiliate permissions, and channel
  reconciliation row scope.
- Contract review, recycle-bin restore/purge, and BI bulk-undo remain Next
  Server Actions and are not yet covered by the HTTP security runner. Testing
  them safely requires a dedicated authorization layer or a stable RSC action
  harness; do not add a public production endpoint merely for tests.
- `.github/workflows/typecheck.yml` now runs separate `typecheck` and
  `security-tests` jobs for pushes/PRs to `master`. GitHub branch protection
  must still mark both checks as required before they become a hard merge gate.
- `.gitignore` now excludes runtime contract templates/generated/stamped/test
  outputs, seal images, project-local skills, and SQLite sidecar files while
  retaining tracked `.gitkeep` placeholders. Do not use `git add .`.
- `prisma/schema.prisma` and migrations have no local diff. `prisma migrate
status` reports all 45 migrations applied and no pending migration.
- The earlier build timeout was diagnosed from `.next/trace`: Next completed
  in about 605 seconds, roughly one second after the tool's old 10-minute
  timeout. After confirming no project Next process was running, `.next` was
  safely removed and a clean `npm.cmd run build` completed successfully in
  about 252 seconds. It created ignored backup
  `backups/dev_pre_deploy_20260717_174107.db`, applied no migrations, compiled
  successfully, generated all 58 static pages, and completed build tracing.
- Local-only files must remain excluded from staging: `.claude/settings.local.json`,
  runtime contracts and seals, database/backups, project-local `skills/`, and
  the root Chinese-named text file.

The older sections below are retained as historical context and may describe
repository or production states that were true earlier but are no longer the
current local state.

## 2026-07-15 customer intake security release

- Commit `1608cd2` (`Secure customer intake review flow`) was pushed to
  `origin/master`; it has not been deployed to production.
- Public intake now requires signed tokens and writes only to the new
  `CustomerIntakeSubmission` review queue. Anonymous requests cannot directly
  update or brand-name-upsert `Customer` records.
- Administrator review APIs/UI, customer-list/detail pending indicators, and
  signed contract Party A fill links were added.
- Migration `20260714000000_customer_intake_review` only creates the submission
  table, indexes, and foreign keys. It was applied successfully to the isolated
  local copy `prisma/intake-review-test.db`, not to `prisma/dev.db` or production.
- Local secrets exist only in ignored `.env.development`. Production still
  needs independent `INTAKE_LINK_SECRET` and `CONTRACT_FILL_LINK_SECRET` values
  in `/root/www/.env` before deployment.
- `prisma validate`, `prisma generate`, and `npx next build` passed. The existing
  repository-wide TypeScript errors remain in unrelated contract, affiliate,
  finance, dashboard, and project files.
- Isolated regression passed: valid general intake created one PENDING review
  and zero formal customers; a no-token request carrying an existing
  `customerId` returned HTTP 401 and wrote no records.

### Production preparation completed (not deployed)

- The missing `/root/www/backup_db.sh` was restored. It uses SQLite `.backup`
  for a WAL-consistent snapshot, runs `PRAGMA integrity_check`, applies mode
  `600` to backups, and retains its `dev_daily_*.db` snapshots for 30 days.
- Manual production backup succeeded at `2026-07-15 10:39:45 +0800`:
  `/root/www/backups/dev_daily_20260715_103944.db`, 105,361,408 bytes,
  integrity `ok`.
- The existing 03:00 root cron entry still calls this restored script.
- Independent production `INTAKE_LINK_SECRET` and
  `CONTRACT_FILL_LINK_SECRET` values were added to `/root/www/.env`; values
  were not logged or committed. `.env` mode is `600`.
- PM2 remained online throughout. Production code is still `4a9be39`; no pull,
  migration, build, restart, or deployment has occurred yet.

### Production deployment completed

- User explicitly approved deployment of `1608cd2`; production fast-forwarded
  from `4a9be39` to `1608cd2` without touching untracked contract/seal files.
- PM2 was stopped before the migration/build. A fresh consistent backup was
  created at `2026-07-15 10:53:40 +0800`:
  `backups/dev_daily_20260715_105339.db`, 105,361,408 bytes, integrity `ok`.
- `npm run build` generated another pre-deploy backup
  `dev_pre_deploy_20260715_105710.db`, applied only
  `20260714000000_customer_intake_review`, and completed the Next.js production
  build successfully.
- The idempotent role normalization script reported all counts zero and changed
  no customer, contract, project, BI, or finance records.
- PM2 restarted with `--update-env` and is online. Production verification:
  HEAD `1608cd2`, 45 migrations up to date, database integrity `ok`, `/login`
  HTTP 200, and unauthenticated `POST /api/intake` HTTP 401.
- Remaining manual acceptance: valid signed intake submission/review workflow,
  customer pending indicators, administrator review UI, and signed contract
  Party A fill-link smoke test.

### Production public-domain hotfix

- A shared intake link was reported as `http://localhost:3000/intake/...`.
  Root cause: production `.env` still had the development default
  `NEXT_PUBLIC_APP_URL="http://localhost:3000"`.
- Production `NEXT_PUBLIC_APP_URL` was atomically changed to
  `https://thraivehub.com`; `.env` mode remains `600`.
- PM2 was stopped and a consistent backup was created:
  `backups/dev_daily_20260715_114137.db`, 105,394,176 bytes, integrity `ok`.
- `npm run build` passed, created
  `dev_pre_deploy_20260715_114326.db`, and reported no pending migrations.
- PM2 restarted with `--update-env` and is online (PID observed `2260125`).
  Public `https://thraivehub.com/login` returned HTTP 200, and the compiled
  intake-link route contains `https://thraivehub.com`.
- Existing localhost links remain invalid externally; users must generate new
  links. Manual acceptance should confirm both general and customer-specific
  copied links begin with `https://thraivehub.com`.

## 1. Mission and end goal

### Product goal

Thrive Hub is an affiliate-marketing operations system. It manages customers,
contracts, projects, affiliate resources, BI sales uploads, finance
reconciliation, operating revenue, tasks, and employee KPI.

The non-negotiable product goal is a stable system that preserves business data.
The production database is SQLite; a previous directory migration lost data, so
database safety takes priority over delivery speed.

### Immediate handover focus

The current completed change set hardens administrator user lifecycle handling:

1. Limit the application to four user roles: `ADMIN`, `USER`, `BRAND`, and
   `CHANNEL`.
2. Replace direct user deletion with a required transfer flow. An administrator
   must review affected data and choose a recipient before the account can be
   removed.
3. Preserve customers, contracts, tasks, projects, finance records, BI batches,
   files, and audit history when an account is removed.
4. Make old role conversion explicit and repeatable without changing business
   records.

The user deploys to production manually over SSH. Do not deploy on their behalf.
Provide the deployment commands only after local verification and a deployment
checklist.

## 2. Current repository state

- Workspace: `C:\Users\17863\Desktop\claude-workspace`
- Branch: `master`
- Remote: `origin` -> `git@github.com:gongwenxiu0203-ona/Thrive-Hub.git`
- Current pushed commit: `4a9be39 Harden admin user transfer and roles`
- Previous pushed commit: `b235691 Improve BI performance and admin observability`
- No new Prisma migration or schema change is included in `4a9be39`.
- Current local development server: `http://127.0.0.1:3001`, Node PID was
  `35956` when this document was written. It is a local `next dev -p 3001`
  process, not production.

The working tree intentionally contains unrelated local files. Do not stage,
delete, revert, or clean them:

- `.claude/settings.local.json`
- Generated/source contract files under `public/contract-templates/`,
  `public/contracts-generated/`, `public/contracts-stamped/`, and
  `public/contracts-test-output/`
- `public/seal/foshan-seal.png`, `public/seal/hongkong-seal.png`
- An untracked Chinese-named text file at repository root

`HANDOVER.md` is also newly created locally by this handover task and is not
part of commit `4a9be39` unless a later user explicitly asks to commit it.

## 3. Completed work

### A. Current commit: `4a9be39`

#### Safe account removal and transfer

Changed files:

- `src/app/api/admin/users/[id]/route.ts`
- `src/app/(app)/admin/AdminClient.tsx`
- `src/app/api/admin/users/route.ts`

Behaviour:

- `GET /api/admin/users/[id]` returns a read-only impact preview grouped by
  customers, contracts/reviews, tasks/reminders, projects/KPI/worklogs,
  finance, BI batches, affiliates, operations records, files, bulk logs, and
  invited/channel-linked users.
- The remove button opens a modal. It loads the preview and requires an
  approved recipient account.
- Removal rejects the current signed-in administrator and self-transfer.
- If the target has channel-specific references, recipient candidates are
  restricted to approved `CHANNEL` accounts.
- `DELETE /api/admin/users/[id]` receives `{ "transferToUserId": "..." }`.
  It transfers supported foreign-key references inside one Prisma transaction,
  then deletes only the selected User account.
- Audit/API history uses nullable actor references and is retained; it is not
  rewritten as if the recipient performed historic actions.
- The original fatal bug was an invalid Prisma reference to
  `customerReconciliation.reviewerId`. The valid fields are `createdById`,
  `submittedById`, and `submittedToUserId`; the code now uses those fields.

Important: no real account was removed during local testing. The modal was not
confirmed against a user.

#### Four-role policy

Changed files:

- `src/lib/permissions.ts`
- `src/lib/dataScope.ts`
- `src/lib/featurePermissions.ts`
- `src/lib/constants.ts`
- `src/middleware.ts`
- `src/actions/auth.ts`
- `src/app/login/LoginForm.tsx`
- `src/app/(app)/layout.tsx`
- `src/app/api/settings/password/route.ts`
- `src/app/(app)/admin/PermissionsPanel.tsx`
- `src/app/(app)/admin/AdminClient.tsx`
- `src/app/api/admin/users/route.ts`
- `src/app/api/admin/users/[id]/route.ts`
- `src/app/(app)/bi/page.tsx`
- `src/app/(app)/projects/page.tsx`
- `src/app/(app)/projects/[id]/page.tsx`

Behaviour:

- Only `ADMIN`, `USER`, `BRAND`, and `CHANNEL` are accepted by create/edit
  APIs and displayed in administrator dropdowns and permission tables.
- Staff checks now include only `ADMIN` and `USER`.
- Guest login, guest overlay, guest password restriction, and guest permission
  configuration were removed.
- Project Strategy AM candidates and BI staff access no longer include
  `LYNQ_STAFF`.

#### Legacy role conversion script

New file: `scripts/normalize-user-roles.ts`

It is idempotent:

- `LYNQ_STAFF` users -> `USER`
- `GUEST` users -> `USER` with `PENDING` status
- Copies a legacy `LYNQ_STAFF` role permission into `USER` only when the
  corresponding `USER` permission does not already exist.
- Removes only obsolete `LYNQ_STAFF` and `GUEST` entries from the
  `RolePermission` table.

It does **not** delete users or modify customers, contracts, projects, BI, or
finance records. It was run locally and reported:

```text
legacyStaffUsers: 0
legacyGuestUsers: 0
copiedPermissions: 0
removedLegacyPermissions: 0
```

Production may have different counts. Before running it on production, state
clearly that it changes role/status values but does not delete accounts or
business records. Existing sessions should re-login after role conversion.

### B. Earlier recently-pushed feature history

Use this only as orientation. Read source before extending a feature.

| Commit    | Scope                                                                                  |
| --------- | -------------------------------------------------------------------------------------- |
| `b235691` | BI performance caching/pagination work and administrator observability panels          |
| `a5ca7c3` | Transactional contract upload flow                                                     |
| `ac9d335` | Affiliate media kit upload and import merge behaviour                                  |
| `8401538` | Operations revenue view using original currencies and reconciliation conversion fields |
| `347fb6c` | BI bulk-operation logs and reversal support                                            |
| `2b42f9d` | Customer deletion impact handling                                                      |
| `9880405` | Project KPI and customer management updates                                            |
| `84acee9` | BI loading optimization and customer bulk actions                                      |
| `0f6f81c` | BI export filters aligned with detail filtering                                        |
| `0ef8b94` | BI date range and SQLite affiliate import fix                                          |
| `f493d3f` | BI upload client-bundle fix                                                            |
| `a7ba5e9` | Contract OCR 60-second fallback                                                        |
| `4d144aa` | Contract OCR upload feedback                                                           |

## 4. Current blockers / known symptoms

### Manual UI verification still needed

The current code clean-builds, but browser automation was blocked by the local
browser URL security policy after server restart. A human should manually test:

1. Open `http://127.0.0.1:3001/admin` as an administrator.
2. Confirm all role dropdowns show exactly four roles.
3. Open `All users`, choose `Remove user` for a non-critical test account.
4. Confirm the impact preview appears and the confirm button remains disabled
   until an approved receiving account is selected.
5. Do not perform the final removal unless the user explicitly identifies the
   source and recipient accounts.

### Known repository-wide TypeScript errors

`npx.cmd tsc --noEmit --pretty false` fails on existing unrelated errors. The
current errors were in contract, affiliate, finance, and project code, including:

- `src/actions/contracts.ts`: nullable string assignments.
- `src/app/(app)/affiliates/AffiliateViews.tsx`: stale named imports and
  missing affiliate constants.
- `src/app/(app)/contracts/*`: nullable customer/field types.
- `src/app/(app)/finance/reconciliations/*`: stale reconciliation field names.
- `src/app/api/finance/channel-reconciliations/*`: stale Prisma field names.
- `src/app/(app)/projects/[id]/page.tsx:265`: existing nullable
  `customerId` mismatch in `ContractOption`.

None of the current errors identify the administrator user-transfer files,
role-policy files, or `scripts/normalize-user-roles.ts`. Do not claim that
full TypeScript validation passes until these existing errors are addressed.

### Local dev-server cache issue encountered and resolved

After removing `guestLoginAction`, an old Next development HMR cache still
referenced it and `/admin` showed:

```text
Runtime TypeError: __webpack_modules__[moduleId] is not a function
Attempted import error: 'guestLoginAction' is not exported from '@/actions/auth'
```

Cause: stale `next dev` process plus a production build reused `.next` while
the dev server was running. Resolution: stop the local Next process, run a
clean `npx.cmd next build`, then restart `npm.cmd run dev -- -p 3001`.

## 5. Next actions, highest priority first

1. **User manual acceptance test**: test `/admin` four-role dropdowns and the
   removal-transfer modal. Do not execute a real removal without explicit
   source/recipient confirmation.
2. **Production deployment only after user confirmation**: deploy commit
   `4a9be39` using the exact safe sequence below. User deploys manually.
3. **Production post-deploy validation**: check `/login`, `/admin`, and verify
   the four roles. If old-role users existed, ask them to log in again.
4. **Only if requested**: resolve the repository-wide TypeScript errors. Keep
   this separate from the administrator change, because it spans unrelated
   modules and needs targeted regression tests.
5. **Only after an explicit request**: commit/push this `HANDOVER.md` and any
   repository-local skill artifact. Do not bundle generated contract files or
   `.claude/settings.local.json`.

## 6. Commands and test results already run

### Passed

```powershell
npx.cmd tsx scripts/normalize-user-roles.ts
# Completed with all counts 0; no business records changed.

npx.cmd next build
# Passed twice. Final clean build completed successfully.

git diff --check
# No whitespace errors (only Windows line-ending warnings).

git push origin master
# Pushed b235691..4a9be39 to origin/master.
```

### Failed / expected failures

```powershell
npm.cmd run build
# Previously could fail during `prisma generate` because a local Next process
# held query_engine-windows.dll.node. Prefer stopping local dev before a full
# build; `npx.cmd next build` isolates front-end build validation.

npx.cmd tsc --noEmit --pretty false
# Fails on pre-existing, unrelated errors listed above.
```

### Local server commands used

```powershell
# Stop only the local Next process after identifying its PID.
Stop-Process -Id <next-server-pid>,<next-dev-parent-pid>

# Start local dev without a visible window.
Start-Process -FilePath 'C:\Program Files\nodejs\npm.cmd' `
  -ArgumentList @('run','dev','--','-p','3001') `
  -WorkingDirectory $PWD -WindowStyle Hidden
```

## 7. Production deployment runbook

Production facts:

- Server: `root@159.75.220.179`
- Project directory: `/root/www`
- PM2 app: `thrive-hub`
- SQLite database: production `.env` points at the production `dev.db`
- Backup script: `/root/www/backup_db.sh`
- Backup log: `/root/www/backups/backup.log`

Before the user executes a deployment, provide this Chinese checklist and wait
for their confirmation if they ask the agent to deploy:

```text
代码变更：管理员用户移交删除、四角色收敛、旧角色转换脚本。
数据库迁移：无新增迁移文件，无 Schema 变更。
破坏性操作：无。角色转换脚本只可能更新旧角色与旧角色权限，不删除用户或业务数据。
备份状态：先查看 /root/www/backups/backup.log；构建脚本会自动备份。
```

The user has repeatedly required this order because SQLite can remain locked:

```bash
cd /root/www
tail -n 10 backups/backup.log
git pull origin master
git rev-parse --short HEAD
# Must show: 4a9be39

pm2 stop thrive-hub
npm run build
npx tsx scripts/normalize-user-roles.ts
pm2 restart thrive-hub --update-env
pm2 status thrive-hub

for i in {1..15}; do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login)
  echo "login http_code=$code"
  [ "$code" = "200" ] && break
  sleep 2
done
```

Do not use `prisma migrate reset`, `prisma db push --force-reset`, `DROP TABLE`,
`DELETE FROM`, or any action that overwrites/removes `*.db` files. Never move
the project directory without a verified database backup.

The user performs SSH deployment themselves. Do not claim a server deployment
has happened merely because GitHub push succeeded.

## 8. Operational pitfalls and rules that must persist

1. **Never assume deployment happened.** The user manually connects by SSH.
   A Git push only updates GitHub.
2. **Stop PM2 before server build.** The user explicitly expects this before
   every SQLite-related production build. Restart only after build and any
   approved data conversion finishes.
3. **Do not delete users blindly.** Customer and contract deletion is
   administrator-only; user removal must transfer all supported references and
   show the affected-data preview first.
4. **Do not rewrite unrelated files.** The repository is normally dirty with
   generated contracts and local settings. Stage explicit files only.
5. **Do not call a full test suite clean when `tsc` is red.** State that the
   clean Next build passed and identify the unrelated type-check gap.
6. **Do not remove the role-normalization script after one local run.** It is
   needed for production and is safe to run repeatedly.
7. **Do not confuse cached dev errors with a failed production build.** Stop
   local Next dev before building, then restart it after building.
8. **Use Windows executables locally.** Use `npm.cmd` and `npx.cmd`; use
   PowerShell syntax rather than Bash `&&` chains.

## 9. Useful source map

- Session and role policy: `src/lib/session.ts`, `src/lib/permissions.ts`,
  `src/lib/dataScope.ts`, `src/lib/featurePermissions.ts`
- Administrator UI: `src/app/(app)/admin/AdminClient.tsx`,
  `src/app/(app)/admin/PermissionsPanel.tsx`
- Administrator APIs: `src/app/api/admin/users/route.ts`,
  `src/app/api/admin/users/[id]/route.ts`
- Observability: `src/lib/adminObservability.ts`,
  administrator tabs in `AdminClient.tsx`
- Database: `prisma/schema.prisma` (SQLite), `prisma/migrations/`
- Local environment: `.env.development` (untracked)
- Production environment: `/root/www/.env`

## 10. Handover skill

- Repository-local source: `skills/handover/SKILL.md` (currently untracked).
- Installed Codex skill: `C:\Users\17863\.codex\skills\handover\SKILL.md`.
- This is a Markdown instruction package, not an executable or a database
  copy. It packages project context, safety rules, the local-development
  workflow, the manual deployment runbook, and role/user-removal conventions.
- At task start it reads this `HANDOVER.md` and `AGENTS.md`. It does not
  automatically run migrations, modify data, commit, push, or deploy.
- Trigger it manually with `$handover` followed by the task, for example:
  `$handover 检查管理员移除用户功能并给出本地测试结果`.
- It should also be relevant for requests mentioning Thrive Hub, Thraive,
  `claude-workspace`, PM2, SQLite/Prisma, administrator permissions,
  contracts, customers, BI, finance, or deployment. Typing `$handover` is the
  deterministic method.
- Start a **new Codex task** after installation. Select **Handover** in the
  skill picker, or type `$handover <request>`. If it is not visible, restart
  Codex and open a new task because the current task does not hot-reload newly
  installed skills.

## 11. 2026-07-24 local work in progress

### Invoice

- The first Invoice phase is implemented locally: list/create/edit/issue/void,
  customer and receivable links, mixed fee types per line, PDF preview/download,
  bank snapshots, and menu placement under Operations.
- `20260724000000_invoice_contract_links` adds the non-destructive
  `InvoiceContract` join table and backfills the legacy primary `contractId`.
  The local migration was applied only after an explicit user confirmation and
  a backup at
  `backups/local-before-invoice-contract-links/dev-20260724-102502.db`.
- Invoice can now associate multiple contracts from the same customer. A
  customer with exactly one contract is selected automatically; customers with
  multiple contracts show checkboxes. The first selected contract remains the
  legacy primary contract for compatibility.
- Browser regression on port 3001 confirmed:
  `[测试] PetLove 宠物用品` auto-selects `DEMO-2026-002`, while
  `[测试] SportMax 运动` exposes four contracts and accepts multiple checked
  selections.

### Permission assignment

- `src/lib/featurePermissions.ts` now defines a current hierarchical catalog:
  group -> module -> granular leaf feature.
- Both role defaults and per-user overrides render the same granular list in
  `PermissionsPanel.tsx`; each leaf can be manually assigned one of NONE, READ,
  EDIT, or MANAGE.
- Exact granular keys take precedence, while legacy keys remain fallback values
  so existing permission rows continue to work.
- Invoice routes and actions enforce `operations.invoices`.
- Remaining security work: most older modules still enforce their historical
  coarse permission or role checks. The new leaf entries are configurable, but
  full action-level enforcement must be migrated module by module before every
  leaf can be considered an independent security boundary.

### Local validation

- Prisma migration applied successfully; database integrity is `ok`, foreign
  key issues are `0`, and legacy Invoice contract links were backfilled.
- `npm.cmd run typecheck`, `npx.cmd prisma validate`, and
  `git diff --check` passed before the final browser regression.
- No commit, push, or production deployment has been performed for this work.

## 2026-08-07 customer reconciliation / Invoice automation (local, not released)

- Customer reconciliation submit now supports `CUSTOMER_REVIEW` and `SKIP_CUSTOMER`; skip mode records a per-reconciliation decision and only accepts corrected sales amount disputes. Order-count dispute input and new writes were removed.
- Confirming a reconciliation no longer creates an Invoice draft automatically. The confirmed reconciliation card shows the next action to create an Invoice; an existing saved draft is reopened first, and Invoice/AR payment status remains read-only on the reconciliation page.
- An `InvoiceReconciliation` link is created only when the user actually saves the prefilled Invoice. Saved drafts remain visible in the Invoice list.
- The authenticated app layout creates one idempotent `INVOICE_ISSUE_OVERDUE` reminder for the reconciliation creator after three full calendar days without a linked `ISSUED` Invoice. DRAFT and VOID do not count as formally issued.
- Migration `20260807151000_invoice_reconciliation_links` only creates the link table and indexes. Local backup was created under `backups/local-before-invoice-reconciliation-links/`; migration applied successfully and `PRAGMA integrity_check` returned `ok`.
- Reconciliation PDF is now an operations report, not an Invoice-like statement. It shows period, locked sales, actual commission rate, amount payable, and per-commission BI summaries/details. Commission exports require `bi.view = READ` and compare current BI totals with locked reconciliation sales.
- Verification passed: TypeScript, Prisma validate/status, diff check, PDF 3-page A4 render QA, and local `/login` HTTP 200. Local dev server restarted on port 3001.
- No commit, push, or production deployment has occurred. Production deployment must stop PM2 before build/migration and verify the latest backup first.
# 2026-08-21 财务工作台与按核销逐期渠道分账（本地，未部署）

- 左侧“开票与收款”已合并为“财务工作台”；开票申请、Invoice/国内票、自动应收、到账核销及渠道付款集中处理。
- Invoice/国内票首次开具时在同一事务幂等创建 `AccountsReceivable`；历史缺失应收已在本地备份后回填。
- 客户到账核销现在触发 `CustomerReceiptAllocation -> ChannelPayableSource`；无渠道、无规则、币种或周期异常写入财务工作台“渠道应付异常”。
- 最新产品口径：渠道分账不再预生成合同全部期数。每次客户对账实际核销时，只为相同费用流和对账起止日期创建一期；后续核销再逐期追加。
- 手工创建/编辑 RULE_DRIVEN 渠道分账主记录也不再生成或重建未来周期。
- 本地错误预生成且无来源/凭证/付款的渠道主记录 `cmt2mi1hw0001ytf8t86t9kh5` 已软删除，可恢复；操作前备份位于 `backups/local-before-empty-channel-master-cleanup-20260821/`。
- 当前“测试测试”历史核销仍因 A 类规则阈值币种 USD 与到账 RMB 不一致而处于异常队列，未擅自换算或生成渠道应付。
- 验证：TypeScript、`git diff --check`、安全测试 26/26 通过。尚未 commit/push/部署。
# 2026-08-24 统一财务工作台（本地已完成）

- `/finance/workbench` 已统一承载开票申请、Invoice、国内发票、应收与收款核销、渠道付款、供应商付款、员工费用报销、客户开票资料。
- 客户对账支持带备注提交开票申请；普通开票申请支持国内/境外票据及结构化 Invoice 明细，费用类型新增 `AFFILIATE_FEE`。
- Invoice/国内发票开具后自动创建应收；工作台显示实际发票号与系统单号，国内发票原件通过鉴权接口下载。
- 新增 `CustomerBillingProfile`、`ManualBillingRequestItem`、`Supplier`、`SupplierBankAccount`、`PaymentRequest*`、`ExpenseClaim*`、`FinanceApprovalStep`、`FinanceAttachment` 等加法模型；迁移为 `20260824130000_unified_finance_requests`。
- 数据库变更执行前备份：`backups/local-before-unified-finance-20260824-125559/dev.db`；构建前另生成 `backups/dev_pre_deploy_20260824_135633.db`。迁移已应用，`integrity_check=ok`、外键错误 0。
- 验证：`npm run typecheck`、`npm run build`、`git diff --check`（仅换行提示）均通过；本地开发服务运行于 `http://127.0.0.1:3001`。
- 未提交、未推送、未部署生产。工作区包含此前多轮财务/合同改造及用户文件，后续提交时务必只选择本次确认范围。

## 2026-08-24 财务工作台收支整合（本地，未发布）

- 财务工作台业务区统一为“开票与收款”和“付款与报销”。开票区包含开票申请记录及应收账款汇总；应收按币种展示应收、已收、余额，并支持单选、全选及带附件导出。
- 付款与报销统一展示渠道商、联盟商、公司供应商、其他付款和费用报销，支持分类筛选、按币种汇总、单选/全选及带附件导出；原“渠道应付异常”更名为“付款异常记录”。
- 新增受权限和数据范围约束的财务 ZIP 导出接口。仅收集系统本地受控附件，限制记录数、单文件及压缩包体积；外部或不安全路径不会打包，并在跳过清单中说明。
- 渠道确认无异议并上传 Invoice 后，系统按渠道期次幂等创建付款申请；要求已确认、已收到对应客户款项、存在匹配付款账户。上传成功但自动建单失败时保留凭证并写入异常审计。
- 渠道确认后三个自然日仍未提交 Invoice 时生成一次幂等站内提醒。目前提醒由已登录员工进入应用时触发扫描，并非独立定时任务；如需严格准点发送，生产环境仍需接入 cron/scheduler。
- Shallow 可在第一阶段驳回；进入财务处理后财务处理人也可填写原因退回，状态和审批步骤在同一事务中更新并保留记录。
- 本轮没有新增 Schema 或迁移，也没有修改业务数据。`npm.cmd run typecheck` 通过；本地浏览器已验证两个主区域、应收汇总、分类筛选和付款异常记录正常渲染。

## 2026-08-24 发票申请表与付款分类修正（本地，未发布）

- 财务流程中的 Invoice 仍是申请入口，申请人不能直接开票。申请表复用正式 Invoice 的客户/合同联动及费用类型、币种、费用期间、推广平台、目标站点、联盟平台、数量、单价和备注字段；提交后经过 Shallow 审核，财务受理时进入 `/invoices/new?billingRequestId=...&focus=invoice`，自动预填申请内容并由财务开具。
- 国内发票申请改为独立紧凑布局：顶部显示开票金额汇总，服务月份使用下拉多选，不含税金额直接录入，默认增值税普通发票和 1% 税率，并自动计算税额及开票金额。
- 付款分类文案统一为渠道商、联盟商固费、公司采购、费用报销和其他；费用报销拥有独立筛选项，不再混入“其他”。
- 未修改 Schema、迁移或业务数据。TypeScript 检查通过；浏览器已验证国内票布局、原 Invoice 字段与客户联动，以及中文付款筛选。

## 2026-08-24 Invoice 申请预填与应收汇总修正（本地，未发布）

- Invoice 申请表与正式开具页统一客户/合同关联逻辑，并补齐 Invoice 日期、付款截止日、BILL TO、客户地址、币种、收款账户、附加条款及明细字段。合同未配置专属账户时，与正式 Invoice 一致回退显示系统全部收款账户。
- 申请人选择的收款账户及头部字段随开票申请保存；财务受理后进入正式 Invoice 编辑器时自动回填，申请人仍不能直接开票。
- 财务工作台顶部删除重复的“登记客户到账”按钮；应收区新增按到期月份筛选以及美元、人民币应收/已收/余额汇总模块。
- 应收表补齐选择列表头，修复客户、发票号码、系统单号、到期日、状态和余额整体错位。
- 未修改 Schema、迁移或现有业务数据。TypeScript 检查和本地浏览器回归通过。

## 2026-08-25 项目进度与折扣数据中心（本地，未发布）

- `/projects` 整合为四个板块：项目进度跟踪、项目折扣汇总、联盟营销、单次合作；原联盟营销与单次合作创建/列表/详情逻辑保留。
- 项目进度首页提供概览和紧凑项目表；`/projects/kpi-config` 支持按项目读取、新增和编辑 KPI；`/projects/source-data` 支持项目源文件上传与状态列表。
- 折扣模块严格分为折扣汇总表、产品信息表、折扣数据源表和字段映射表，支持项目选择、读取、刷新及新增。
- 新增 `prisma-projects/schema.prisma` 和纯 CREATE 迁移，使用 `PROJECT_DATA_DATABASE_URL` 及独立生成的 Project Prisma Client。该库与现有主库/BI 数据物理分离，仅用 scalar projectId/userId 做应用层关联。
- 项目源文件使用 `PROJECT_DATA_UPLOAD_DIR` 独立存储，带 30MB、扩展名、SHA-256 去重、路径边界与项目数据权限校验，不进入 BI 上传目录。
- 项目进度跟踪首页已改为销售数据 Dashboard：支持月份、周一至周日周次、项目筛选，展示已录入项目、按币种月度 KPI、本周销售、整体完成率及三列项目进度卡；多币种禁止直接相加。
- KPI 配置页已按月展示项目、AM、GMV 目标、80% 达标线，支持编辑、删除和多行批量新增；项目下拉找不到时可在弹窗内手动创建项目，再将 KPI 写入独立项目数据库。
- 构建流程新增 `scripts/prepare-project-db.js`：检查项目库迁移不含破坏性 SQL、单独备份、生成 Client 并执行独立迁移。
- 本地项目库初始迁移已应用。`npx.cmd tsc --noEmit --pretty false`、`npm.cmd run build`、`git diff --check` 通过；浏览器验证项目首页、折扣四表、KPI 和源数据页无运行错误。
- 本地开发服务运行于 `http://127.0.0.1:3001`。未 commit、未 push、未部署生产。

## 2026-08-25 内部角色创建与关联范围修正（本地，未发布）

- 新增通用 `creationReferenceCustomerScope`：内部 `ADMIN` 与 `USER` 在创建或关联业务记录时均可选择全部未删除客户，不再按客户创建人、业务负责人或后台负责人过滤。
- 已应用到合同新建、已有合同上传、合同编辑、合同服务端保存校验、项目创建，以及销售记录和 Invoice 的客户关联校验。
- 客户列表、客户详情及外部角色的数据可见范围未放开；`BRAND` 与 `CHANNEL` 仍保持原有硬隔离。
- 本轮未修改 Schema、迁移或业务数据；TypeScript 与 `git diff --check` 通过，未 commit、未 push、未部署。

## 2026-08-25 内部角色全站全量数据权限（本地，未发布）

- 权限口径统一为：`ADMIN` 与内部员工 `USER` 只由功能叶权限决定是否可查看、编辑或管理；一旦拥有对应功能权限，不再按创建人、负责人、申请人、上传人或操作人限制业务记录范围。
- 公共行级范围已覆盖客户、合同、客户对账、渠道分账、任务、BI 销售、项目、KPI、提醒和附件；外部 `BRAND`、`CHANNEL` 的租户/归属隔离保持不变。
- 清理了任务写入与转派、BI 操作日志、工作日志、财务付款/报销/开票申请、合同审核队列、回收站恢复等页面或动作中的内部员工二次归属过滤。
- 任务页和工作日志页默认展示全量并支持按成员/我的记录缩小；站内信的未读计数与批量已读仍只作用于当前收件人，避免替其他员工改变阅读状态。
- 未修改 Schema、迁移或业务数据；TypeScript、`git diff --check` 以及内部 `USER` 9 类公共 scope 全量/外部 `CHANNEL` 隔离断言均通过。未 commit、未 push、未部署。

## 2026-08-25 项目折扣源提醒与响应式验收（本地，未发布）

- 折扣源数据管理已对齐原应用：飞书链接识别、数据源身份字段、项目与表头行关联、映射/同步状态，以及编辑、映射、提醒、同步、删除操作；同项目内按来源和飞书表身份查重。
- 独立项目数据库新增 `ProjectDiscountReminderSetting`、`ProjectDiscountReminderRun`；纯 CREATE 迁移 `20260825170000_discount_reminder_settings` 已在本地应用，未修改主业务库或 BI 库。
- 提醒接收人从已审核内部用户中按姓名选择；定时入口 `/api/cron/project-discount-reminders` 使用 `PROJECT_DISCOUNT_CRON_SECRET`，按时区与计划时间幂等生成同步失败、折扣临期站内信。
- 项目源数据汇总缺少汇率时不再按 1:1 计入；未配置换算的异币种保持阻断，避免错误汇总。
- 项目进度、KPI、源数据、折扣导航、源数据弹窗、筛选区及宽表已在 360px 与 768px 验收，无页面级横向溢出。
- 验证通过：项目 Prisma validate/generate/migrate status、TypeScript、`git diff --check`、本地页面与新增数据源交互。服务运行于 `http://127.0.0.1:3001`。
- 未 commit、未 push、未部署生产。生产定时执行仍需配置 cron secret 与调度器调用。

## 2026-08-25 飞书折扣源真实同步接入（本地，未发布）

- 新增 `src/lib/feishuDiscountSync.ts`，仅从 `FEISHU_APP_ID` / `FEISHU_APP_SECRET` 读取企业自建应用凭证并缓存短期 `tenant_access_token`，密钥未写入仓库。
- 支持 Wiki 节点解析、飞书多维表格 500 条分页（最多 20 页）、电子表格 A:ZZ 每 100 行分批（最多 5000 行）、富文本/链接/多选/时间值规范化。
- 字段映射页面的源字段和样例改为实时读取；同步入口不再固定失败，现会执行映射、日期/金额/百分比转换、缺失折扣率计算、内容键查重、增改删统计及同源并发锁。
- 同步写入仍只进入独立 `PROJECT_DATA_DATABASE_URL` 项目库，不修改主业务库或 BI 库；失败会保留明确错误并更新数据源状态，不写伪造记录。
- 服务器凭证连通性已只读验证：Token 获取成功；测试 Wiki 节点识别为 sheet；测试范围读取成功（10 行、702 列），未输出 Token、Secret 或表格业务内容。
- 当前本地 `.env.development` / `.env` 尚未检测到飞书变量，因此本地 UI 端到端同步仍需补齐本地环境变量并重启开发服务。
- 服务器 `PROJECT_DISCOUNT_CRON_SECRET` 格式检查显示长度 20 且含空格，不是 `openssl rand -hex 32` 的 64 位结果；部署前必须修正，并同步调度器请求头。
- TypeScript 与 `git diff --check` 通过；本轮无 Schema 或迁移变更，未 commit、未 push、未部署。

## 2026-08-25 项目 KPI 与折扣应用严格对齐（本地，未发布）

- 项目数据继续使用 `PROJECT_DATA_DATABASE_URL` 对应的独立 Prisma/SQLite 数据库；现有业务库与 BI 库未拆分、未迁移、未写入本次源数据或折扣数据。
- 项目 Dashboard 已按原应用改为月内自然周、月度 KPI、月累计销售、时间进度比风险判断，并保留多币种分组，禁止跨币种直接相加。
- KPI 配置支持月份、项目、AM、目标币种、GMV 目标、80% 达标线、批量新增、编辑、删除及找不到项目时手动创建。
- 源数据管理已实现原始/已处理双页签、当月 KPI 项目、多平台多文件上传、日期和金额解析、币种检测与冲突确认、固定汇率换算、单删/批删/重处理、删除后重算，以及项目级文件明细、原币小计、汇率和项目币种汇总。
- 平台映射严格为 ACC/Sales、Levanta/sales、Wayward-CC/ccSales、Wayward-attribution/GMV、领星（ACC）/销售额。
- 折扣管理已拆为折扣汇总、产品信息、折扣数据源、字段映射四个独立页面；包含原应用 21 列汇总、11 字段产品资料、Excel/CSV 自动映射导入、飞书链接解析与 16 个标准字段映射。
- 当前仓库没有可用的飞书表格读取凭证/连接实现，折扣数据源同步会明确返回 FAILED 和原因，不会伪造成功数据。
- 独立项目库新增迁移 `20260825123000_original_app_alignment`，仅包含 ADD COLUMN / CREATE TABLE / CREATE INDEX，无 DROP、DELETE 或 TRUNCATE；本地已应用，迁移状态最新。
- 生产保护要求项目数据库、项目上传目录和项目备份目录位于发布目录外；分别使用 `PROJECT_DATA_DATABASE_URL`、`PROJECT_DATA_UPLOAD_DIR`、`PROJECT_DATA_BACKUP_DIR`。
- 验证通过：双 Prisma validate/migrate status、TypeScript、git diff-check、Next.js production build（77/77 静态页）、本地浏览器主要页面与 API 200 回归。
- 本地开发服务运行于 `http://127.0.0.1:3001`。未 commit、未 push、未部署生产。
## 2026-08-25 客户合作结束与对账计划闭环（本地，未发布）

- 客户新增 `cooperationEndDate`；迁移 `20260825193000_customer_cooperation_end_date` 仅执行 `ADD COLUMN`，无 DROP/DELETE/TRUNCATE。本地迁移前备份为 `backups/dev_pre_deploy_20260825_175901.db`。
- 客户对账自动生成条件统一为：合同状态 `COMPLETED` 且客户状态 `COOPERATING`。合同完成入口会先推进客户状态，再幂等生成固定费连续 30 天、佣金首月/自然月/末期截断的完整计划。
- 客户切换为“结束合作”必须填写结束日期：结束日后的对账计划标记 `CANCELLED`；跨结束日且尚未产生财务事实的记录截短到结束日并写周期审计；已确认、已开票或已收款历史不改金额、不删除，只保留审计说明。
- 管理员可在结算中心“作废记录”页签单条或批量恢复记录，恢复原因必填；若客户仍为结束合作且记录在结束日之后，则禁止恢复，需先调整客户状态/结束日。
- 客户对账手工创建仅允许合作中客户，选择合同后默认合同起止日期和固费+销售佣金，并复用自动计划的周期划分算法。
- 合同软删除策略：取消未确认客户对账和未完成合同任务；仅软删没有付款来源的空渠道主记录；已确认对账、开票申请、Invoice/国内发票、应收、收款核销、渠道应付/付款和项目历史全部保留，避免破坏财务审计链。
- 验证通过：Prisma validate/generate/migrate deploy、TypeScript、周期测试、`git diff --check`；数据库 `integrity_check=ok`、外键错误 0。
- 未 commit、未 push、未部署生产；工作区仍含未发布的项目管理及其他本地改动，提交时必须按范围精确暂存。
# 2026-08-27 合同/Invoice 编号与合同补充文件（本地未提交）

- 合同详情新增管理员修改编号：必须填写原因，编号全局唯一，写管理员审计。
- Invoice 详情新增管理员修改编号：必须填写原因；若已创建应收账款，同事务同步应收的 invoiceNo，并清空旧 PDF 地址以便重新生成。
- 新建合同增加“渠道商合同上传”：关联客户、类型固定 CHANNEL、负责人默认上传人、不做字段识别，编号 `CHANNEL-年份-三位序号`。
- 事务性合同编号由 `TX-年份-序号` 改为 `COMPANY-年份-三位序号`。
- 合同详情新增附加条款/补充文件追加存档；新增 `ContractAddendum` 表及迁移 `20260827153000_contract_addenda`，迁移仅 CREATE TABLE/INDEX，无破坏性 SQL。
- 本地已执行 `prisma migrate deploy`，69 个主库迁移全部成功；`tsc --noEmit`、`git diff --check`、完整 `npm run build` 均通过。完整构建测试使用临时的外置项目数据库环境变量，不修改生产配置。
- 本批改动尚未 commit/push/deploy；工作区原有 `.claude/settings.local.json`、`output/` 和临时 scripts 文件均未触碰。
# 2026-08-27 多合同客户对账与跨合同开票（本地未提交）

- 新建客户对账时，客户仅有一份有效合同时自动关联并带出合同起止日期；存在多份合同时允许选择一份，或一次全选该客户全部有效合同，不允许只选其中多份。
- 单合同继续使用可编辑的手工对账周期；全选多合同时，每份合同分别按自身起止日期及既有规则生成：固费连续 30 天，销售佣金首月至自然月末、后续自然月、末期按合同结束日截断。
- 多合同创建在一个事务内先完成资格、范围和重叠检查，任一合同冲突则整批不写入；接口继续兼容旧单合同请求。
- 客户对账详情新增“全部合同 / 各合同”切换，保留固费与销售佣金左右双列和原佣金确认逻辑；全部合同视图支持跨合同勾选并统一提交开票申请。
- 财务工作台显示申请涉及的全部合同编号；财务继续开票时 Invoice 自动预填全部合同，并在保存时严格校验申请的对账集合和合同集合，避免漏选或额外关联。
- 本次无 Schema 或迁移变更；周期规则测试、TypeScript 和 `git diff --check` 已通过，尚未 commit、push 或部署。
