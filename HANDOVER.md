# Thrive Hub Handover

Last updated: 2026-08-06 (Asia/Shanghai)

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

| Commit | Scope |
| --- | --- |
| `b235691` | BI performance caching/pagination work and administrator observability panels |
| `a5ca7c3` | Transactional contract upload flow |
| `ac9d335` | Affiliate media kit upload and import merge behaviour |
| `8401538` | Operations revenue view using original currencies and reconciliation conversion fields |
| `347fb6c` | BI bulk-operation logs and reversal support |
| `2b42f9d` | Customer deletion impact handling |
| `9880405` | Project KPI and customer management updates |
| `84acee9` | BI loading optimization and customer bulk actions |
| `0f6f81c` | BI export filters aligned with detail filtering |
| `0ef8b94` | BI date range and SQLite affiliate import fix |
| `f493d3f` | BI upload client-bundle fix |
| `a7ba5e9` | Contract OCR 60-second fallback |
| `4d144aa` | Contract OCR upload feedback |

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
