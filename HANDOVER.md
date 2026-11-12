# Thrive Hub Handover

## 2026-11-12 本轮发布收尾（用户要求commit/push，手动部署）

- 用户追问未完成为何不继续后，重新执行next build --experimental-debug-memory-usage，编译12.2分钟，87/87静态页面，最终exit0；此前中止不能算成功，本次已补足完整构建。最新预览在3001，使用新建preview.db隔离副本（从旧虚构测试ui.db在线备份并仅追加本次迁移），真实dev/生产未改。Computer Use因无法可靠识别当前浏览器URL而被安全终止，不能声称视觉/浏览器交互验收通过。
- 本轮用户明确只commit/push，生产手动部署。只读生产当前c4373d8，最近每日备份2026-11-12 03:01:55 +0800、1506578432 bytes、integrity=ok。新增scripts/deploy-finance-am.sh手动发布脚本：核对指定commit与两库存在、停PM2并确认stopped、build自动两库备份迁移、verify-finance-am-migration.py比较旧主库所有数据与新增4空表、生成独立AM cron密钥（旧env私有备份）、成功后restart/login200、备份保留旧crontab并追加5分钟flock扫描。此脚本适用于本次首次迁移发布；失败/中断后不要盲目反复执行或重启，应先核对迁移及备份状态。
- 未执行生产pull、构建、迁移、env写入或cron安装。生效分账/月度AM真实推送及浏览器仍需用户上线验收；外部角色飞书不支持，已绑定启用内部账号沿用现有配送。所有无关私有文件和隔离测试数据库不提交。

## 2026-11-12 合同AM、审批配置与退回重提（本地待完整构建/手动验收，未发布）

- 用户明确确认数据库结构变更；新增迁移20261112160000_contract_am_finance_workflows，仅CREATE四表与索引：ContractAMAssignment、ContractAMMonthlyDispatch、FinanceApprovalPolicy、FinanceRequestRevision。不重建旧表/不清表。真实本地库在线备份backups/finance-am-workflow-20261112-01/before.db，迁移测试另用baseline.db/engine.db；verify-finance-am-migration.py验证所有旧表schema和行哈希不变、仅新迁移与4空表增加，integrity/FK通过。真实dev.db和生产未迁移。
- 合同详情多选AM、首页批量APPEND/REPLACE/CLEAR；逐条合同scope及EDIT校验，不授予AM额外数据权限。AM扫描按上海每月5日09点后当日、签署完成有效且未结束合作客户；合同/人/月唯一事务防重，账号移交同步AM关系，历史投递键保留。站内Reminder进入原飞书队列；仅已绑定启用内部账号能飞书推送，外部账号仅站内。cron API独立CONTRACT_AM_CRON_SECRET，runner scripts/contract-am-cron.cjs；生产密钥/cron尚未配置，不能称已启用定时推送。
- 管理员面板新增财务审批配置，只允许实际启用管理员且admin.permissions权限；三类流程可设置审核人/免审批/默认财务经办人，配置版本并发保护，新提交/重提读取当前策略，在途不改。SKIPPED兼容待开票与财务受理；免审批不跳过开票/付款/凭证核销事实。
- 修复NONE与空占位值冲突，PAYONEER独立手填收款方式，服务端白名单存payeeSnapshot.paymentMethod。退回本人原单编辑与重提，字段、日期区间、明细、备注、账户、附件预填，重提原ID/单号、CAS、旧步骤/政策/内容快照、流转审计、新审核待办。多明细付款/报销保留，关联确认书手工项固定原关联/次序；对账源单仍须回原业务流程，不可覆盖已确认源金额或已有票据/付款事实。
- 新financeResubmit.ts按实际User启用状态/内部角色+本人+EDIT+REJECTED鉴权。上传stage三种_STAGED绑定本人，新申请绑定正式附件，重提只归档旧引用不删原件。stage新增精确middleware排除并独立真实账号/功能鉴权，避免FormData重放。
- 验证：类型检查通过；finance-approval-policy-test、contract-am-rules-test及finance-am-integration-test通过。finance-resubmit-integration-test真实SQLite事务（仅mock身份/框架边界）验证三类创建/退回/本人DTO/新策略/同ID重提/原附件引用/非本人拒绝/两次并发恰一成功/付款事实锁定，integrity/FK通过；每次使用新example.invalid隔离fixture，无真实飞书或物理附件上传测试。完整构建进行中，视觉及真实推送未验收，不可声称通过。
- 只读prisma migrate diff发现旧ContractFieldReview/InvoiceContract/Project等历史schema drift；仅预览未保存执行任何DROP/重建SQL，本次迁移仍只4CREATE TABLE，禁止顺手自动修复旧差异。
- 未commit/push/部署；无关私有设置、output、临时脚本保留。发布前需重新确认清单并停PM2、即时备份两库、migrate/build成功后重启；不可在在线SQLite连接上构建迁移。
- 后续收尾：手工确认书关联项保留原关联/次序，历史多明细付款支持items编辑而非合并；DATE_RANGE保留。补真实启用账号校验、AM中文提醒标签、SKIPPED待开票受理和工作台路由、revision轮次时间线。最新typecheck及三类并发重提/AM隔离集成均通过。完整next build在隔离engine库、本机权限环境长时间停在compile且CPU持续占用，主动中止（exit非0），不能当作构建成功；发布仍被完整构建及浏览器人工验收阻挡。没有生产改动、真实通知或提交推送。本地旧预览此前已停，需构建完成后再恢复，不应向用户承诺3001已可用。

## 2026-11-12 国内发票与渠道合同归档修复（待用户手动部署）

- 国内发票详情/审核/继续开票增加抬头、税号、普票/专票、地址电话及银行等信息；新申请由服务端读取所选资料并保存快照，旧申请按原资料ID回读并明确提示为当前资料、开票前核对。不重算已开票历史。
- 修复将含税申请总额再次当作未税额加税：优先保持原逐行未税/税额和混合税率，示例净额18439.00、税184.39、总额18623.39；归档校验申请汇总与分摊尾差。
- 国内发票multipart上传从精确middleware路径排除body重放，两个API独立验证已启用内部账号及功能权限；损坏请求中文400、大小/类型/签名校验。原件下载改为独立鉴权后直接读文件，兼容没有FinanceAttachment索引的旧记录，含路径realpath边界校验。
- 渠道合同归档不再要求finance.channel_split_rules EDIT；无分账授权的内部合同编辑者可归档，比例只存待确认文本，不生成生效规则。生效规则仍仅管理员/明确授权内部员工设置；已有规则的比例和截止日期保留权限保护，不新增FINANCE角色。
- 渠道分账页增加ChannelReconciliationGuide，解释自动生成/到账释放/阈值/币种/确认/凭证/付款/防重要求。明确当前累计是来源合同与周期，不是跨合同每客户每月全局汇总；本次没有修改分账算法，该差异后续需独立处理。
- 核心文件：src/lib/domesticBilling{,Details}.ts、src/components/finance/DomesticBillingInfo.tsx、国内发票页面及API、financeUnified.ts、contracts.ts、channelArchiveRules.ts、ChannelReconciliationGuide.tsx、channelReconciliationGuide.ts及相应测试脚本。
- 数据隔离：只用backups/finance-domestic-20261112-01/{engine,ui}.db，before.db为回滚副本；engine与before字节SHA一致、integrity/FK通过。ui仅添加example.invalid虚构账号/申请用于HTTP验收，飞书配送关闭。未改真实dev.db/生产数据/Schema/migration。
- 四组专项测试（domestic-billing-rules、domestic-invoice-upload、channel-archive-permission、channel-reconciliation-guide）通过。完整构建/HTTP归档下载验收正在收尾，结果后续追加；不得预称完成。浏览器登录虚构账号后自动化超时，未完成视觉验收，不能声称截图检查通过。
- 本轮未commit/push/部署。私有配置、output/private.zip、旧临时脚本等无关dirty文件保留，不要全量git add。
- 最终验证：独立typecheck通过；本机权限环境next build成功（编译约13分钟，86/86页面，exit0；先前沙箱编译中止未当成通过）。真实HTTP在3002验证未登录401、损坏multipart中文400、归档201、正确净/税/总额/逐行分配/抬头/应收、重复归档拒绝、审核人及申请人原件下载与上传字节一致，均通过。
- 仍有明确限制：PDF自动识别在Next运行时对测试件返回500中文手填提示（独立pdf-parse能解析，同文件上传归档下载字节完好，故不能声称识别已修复）。HTTP脚本首次在识别断言停止；后一次先完成所有归档下载断言，随后仍在识别断言失败。脚本已改为明确报告识别fallback及LIMITATION，不把失败识别算成识别成功；虚构申请已COMPLETED，脚本禁止重置复用。后续需要新虚构fixture才能重新跑完整归档。
- 最终再次核对before/engine字节SHA一致，before/engine/ui三库integrity/FK均通过；没有迁移。测试3002已停止，恢复本地3001的生产构建预览，仍使用ui副本及关闭飞书。视觉验收未完成，待用户手动核对。
- 用户随后要求commit并提供完整手动部署代码（不代部署），本轮仅提交相关源码/测试/交接，不提交私有配置或数据库。只读核对生产仍42f76d0，最新每日备份2026-11-12 03:01:55 +0800、1506578432 bytes、integrity=ok。部署须git快进拉取、停止并确认PM2 stopped、运行npm run build自动备份迁移、仅成功后重启并验证login200；失败保持停服，不直接restart掩盖错误。没有执行生产pull/stop/build/重启。

## 2026-11-06 飞书通知已部署并启用：c0ba617（包含65874c6）

- 用户明确确认提交并部署，业务65874c6和独立state签名修正c0ba617均已push并上线。生产86/86页构建exit0，主库79/项目库3迁移最新。新迁移只新增两个空表；没有创建生产测试账号/绑定/业务通知，没有发送真实飞书消息，用户仍需自行绑定并测试。
- 最终停服后的即时回滚点：`/root/www/backups/dev_manual_feishu_20261106_02.db`（1506578432 bytes，2026-11-06 11:43:38 +0800）及 `/root/thrive-data/project-backups/projects_manual_feishu_20261106_02.db`（270336 bytes，11:44:51），0600且完整性/外键通过。01手动备份也保留，不覆盖/清除。构建自动备份为 `dev_pre_deploy_20261106_114458_044.db` 和 `projects_pre_deploy_2026-11-06T03-46-15-130Z.db`，仅按既有策略轮换上一份pre_deploy，没有清理业务数据。
- 重启前 `scripts/verify-feishu-release.py` 比较所有旧表全字段流式SHA256、列定义、既有schema及迁移记录，全部与02即时备份一致，仅一条已完成迁移和两个空新表增加。完整证明日志 `/root/www/backups/verify_feishu_20261106_02.log`。项目库所有表hash（含迁移）也一致；两库integrity=ok、FK无错误。所有检查通过后才恢复服务。
- 实际时间必须如实交接：构建已于11:48完成，但工具结果等待异常延长，root未及时拿到完成结果，造成最终停服从约11:43延长至12:49；已向用户道歉，不能把本次描述为短暂停服或正常耗时。此前首次预检拦截JWT缺失时没有迁移/构建，曾恢复旧版服务；最终02备份覆盖恢复服务后可能新增的数据。不能据此用旧01备份回滚。
- 已安全写入独立通知App/tenant及Secret，原FEISHU_APP表格同步凭证不变；独立cron/state密钥各为随机64hex，不在Git、参数或日志暴露。原env快照 `backups/env_manual_feishu_20261106_01`，追加state前快照 `backups/env_manual_feishu_state_20261106_02`，均0600。
- 用户在异步问题中明确同意“同时更换，接受所有账号重新登录”。已将原缺失的网站JWT_SECRET换为另一个独立随机64hex，改前配置保存 `backups/env_manual_jwt_20261106_01`；原登录会话因此失效，业务数据不变。上线HTTP校验旧签名401，新签名仅使用明确不存在的虚拟用户得到403，未假冒任何真实用户。JWT/state/cron三密钥独立。
- PM2 PID2872441 online，本机及公网 https://thraivehub.com/login 均200。错误日志仍2026-11-06 11:02:49 +0800、17128759 bytes，无本次恢复新增错误。飞书cron无密钥401、正确密钥200，返回queued/sent/failed/cancelled均0；真实企业授权与本人消息收取仍待用户验收，不能声称已收到消息。
- 已备份原root crontab至 `backups/crontab_manual_feishu_20261106_01`（0600），保留所有旧行并追加每分钟flock + `scripts/feishu-notify-cron.cjs`，只从服务端env读取密钥、请求本机API。每日03:00备份和每15分钟项目提醒未变。用户入口 https://thraivehub.com/settings，重新登录后点击“绑定飞书并启用推送”及“发送测试消息”；只推绑定后的新通知，不补发历史。
- 工作区无关个人设置、output部署helper、临时脚本及私有配置均未提交；生产原env/backup_db.sh/签章/scanner等保留。后续不得把新密钥填进文档或聊天，也不要擅自清理手动回滚备份。

## 2026-11-06 飞书个人通知接入（本地完成，待凭证联调/发布）

- 首次上线尝试：65874c6已push并拉到服务器，停PM2后即时备份main `backups/dev_manual_feishu_20261106_01.db`（1506578432bytes）和项目 `projects_manual_feishu_20261106_01.db`（270336bytes），两者完整性/外键正常。安全安装了独立通知env，原FEISHU_APP凭证保留，env原件备份 `backups/env_manual_feishu_20261106_01`（0600）。预检发现生产env和PM2均未配置JWT_SECRET，故在任何build/迁移之前主动拦截；核验主库无本次migration、完整性和旧build保留后恢复旧版，PID2854109，login200、错误日志未新增。
- 为避免擅自轮换网站登录密钥导致全员失效，飞书授权改用独立 `FEISHU_NOTIFY_STATE_SECRET`（优先；仅回退到>=32字符的JWT）；相应env/docs/OAuth拒绝路径测试同步。原网站会话签名配置风险已向用户说明，需另行安排修复，不在本次暗改。该修正不新增Schema；正在本地复测构建，后续正式部署必须停服再生成更新的02备份，不能把恢复服务前的01备份当最新回滚点。

- 用户已明确“确认提交并部署飞书通知”。发布复测修复新入队默认时间可能领先JS due筛选的毫秒边界，显式使用JS nextAttemptAt；队列连续10轮、OAuth、旧数据核对、独立tsc及最终86/86构建通过。新增 `scripts/verify-feishu-release.py` 对备份与迁移后所有旧表全字段流式SHA256及旧schema/迁移记录校验，本地PASS。一次性私有部署helper改用base64脚本和SSH stdin传凭证；已在服务器临时目录以纯模拟凭证演练换行、旧key保留、原子替换/0600和env备份，真实配置未动。helper位于output，不纳入提交。

- 用户开通权限后再次实际核对成功：通知AppID `cli_aa66f5ffe1b85c13`，企业 `Thraive Digital Marketing`，tenant_key `1943066d21071bac`；该非Secret标识已加入私有本地配置模板。没有发送消息。生产只读预检当前caa1db6、PM2 online，最近每日备份2026-11-06 03:01:36 +0800、1506578432bytes、integrity=ok，磁盘余14GB。接下来等待本次commit/push及部署清单确认，仍未更改生产配置/数据库/cron。

- 用户随后告知已填写本地私有凭证。官方接口实际核对：应用凭证获取成功；企业信息查询返回99991672，白名单权限诊断为缺少 `tenant:tenant:readonly`。尚未获得tenant_key；需管理员开通获取企业信息权限并发布生效后重试。未输出Secret/token、未发送消息、未修改生产配置或数据库。检查脚本已加安全的接口阶段和权限名诊断，不输出原始响应。

- 用户明确回复“确认数据库结构变更”，授权新增飞书绑定和配送两表。迁移 `20261106120000_feishu_notifications` 显式 BEGIN IMMEDIATE/COMMIT，只 CREATE TABLE/INDEX，旧 User/Reminder 仅增加 Prisma 反向关系，不重建/改写旧业务表、BI或通知；生产未迁移、未部署、未安装cron。
- 新增个人设置飞书绑定、启停、解绑、本人测试消息及最近配送状态；采用现有 Impeccable Product 设计规范，移除把注册时 `feishuAuth` 日历勾选视为真实授权的展示。此功能限已启用内部 ADMIN/USER，不改变网站原有登录及业务权限。
- OAuth 使用固定公开网站地址、PKCE S256、10分钟签名HttpOnly cookie、随机state、网站用户/当前session哈希/应用/企业校验；同一飞书身份不可绑定多个网站用户。不保存用户OAuth access/refresh token，不泄露Provider原始错误或Secret。
- Worker统一扫描事务已提交的Reminder，按本人target和binding.enabledAt/createdAt处理新增；不按remindDate补发。只发送标题+白名单详情链接，不发送银行/附件/财务备注。唯一任务、稳定UUID、原子lease领取、有限退避重试；发送前再查当前绑定/用户/通知目标/软删，解绑与用户移除级联仅删除新表个人记录，不移交飞书身份。不能保证撤回在途消息或绝对exactly-once。
- 新cron `/api/cron/feishu-notifications` 已加入middleware机器端点白名单，仍独立校验至少32字符Bearer密钥；`scripts/feishu-notify-cron.cjs`读取服务器env，通过本机HTTP调用，文档使用flock。默认关闭，独立 `FEISHU_NOTIFY_*`，不会覆盖原飞书折扣表格同步 `FEISHU_APP_*`。
- 本地数据保护：从上轮预览engine只读SQLite backup生成 `backups/feishu-notify-20261106-02/before.db` 和隔离engine；最终79迁移成功，全旧表/列/行逐值SHA256一致、完整性ok、外键无错误，新表空。`fault-rehearsal.db`模拟迁移中途失败并ROLLBACK，历史数据完全保留。01目录为早期无显式事务版本的演练副本，保留不覆盖，最终迁移以02为准；未改真实prisma/dev.db。
- 自动验证：worker mock隐私/并发去重/重试/租约/目标移交/暂停/解绑/用户删除级联；OAuth错state/user/app/session/过期/错企业及错误脱敏；本地production HTTP session/role/Origin、PKCE授权地址、无效回调、cron实际通过middleware并校验密钥、settings SSR均通过，无真实飞书发送/绑定，fixtures全部回滚。TypeScript与diff检查通过，Next生产构建86/86页exit0；生产构建跳过类型检查，独立tsc已另行通过。
- 构建使用独立外置项目副本 `C:/Users/17863/AppData/Local/Temp/thrive-feishu-build-298fd2a015fc48678c7f8b99158d1380/projects.db`，其3迁移最新；未动现有项目库。本地HTTP测试使用假的App/Secret和固定JWT，3002测试服务已停止。Next公开环境变量构建时冻结，HTTP测试使用本机构建fixture域名；生产必须以正确正式域名构建，不能靠启动时修改NEXT_PUBLIC_APP_URL修复。
- 当前预览 http://127.0.0.1:3001/settings（session26729）只连接02隔离engine及上述外置项目副本，FEISHU_NOTIFY_ENABLED=false；未完成浏览器交互/真实企业授权验收，不宣称推送已启用。配置与启用步骤见 `docs/feishu-notifications.md`。
- 用户提供通知应用AppID `cli_aa66f5ffe1b85c13`，不知道tenant_key。只读核对生产旧表格应用AppID不匹配，通知Secret尚未配置；没有覆盖旧凭证。正式公开地址只读核实为 https://thraivehub.com，回调为 https://thraivehub.com/api/settings/feishu/callback。已建立Git忽略的 `.env.feishu-notify.local`模板，等待用户自行填Secret；不得读取/输出原值，不提交Git。`scripts/feishu-notify-check.cjs`仅凭证+企业查询，不发消息，可核对tenant_key；尚未使用真实新凭证查询。App Secret不要在聊天里索取。
- 未commit/push/生产部署；需用户完成安全配置、飞书后台权限/可用范围/发布，并完成真实授权与本人测试。发布仍须按AGENTS中文部署前清单及确认，停PM2、即时备份、迁移/构建/旧数据核对后才重启，再保留既有crontab追加任务。无关.claude设置、output、私有文件与旧临时脚本未纳入本轮。

## 2026-11-05 财务两轮修改已部署：d6ba026

- 用户后续明确改为代部署，并确认继续等待 Chromium 安装，覆盖下方“手动部署/尚未发布”的过程状态。业务提交 `d6ba026434f118e94107ecbbe55d0cfe5c702541` 已 push 并上线；本次无新 Schema、迁移、回填或清理。保留生产原 `.env` 和未跟踪文件。
- 按顺序拉代码、停止 PM2 并确认 stopped、独立即时备份、安装依赖/浏览器、PDF smoke、完整 build、核对数据库、重启。即时备份 `/root/www/backups/dev_manual_release_d6ba026_20261105_01.db`（1506578432 bytes、0600、integrity=ok）保留，不擅自清理。构建备份 `/root/www/backups/dev_pre_deploy_20261105_164748_392.db`；项目库备份 `/root/thrive-data/project-backups/projects_pre_deploy_2026-11-05T08-49-08-423Z.db`。
- Chrome 官方下载首次耗时较长且 SSH 中断，缓存安装重试成功 exit0；实际路径 `/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome`，运行用户 root。npm ci 成功；npm 报告29项依赖漏洞（1 low/5 moderate/22 high/1 critical），未擅自 audit fix，需另行评估。
- 生产 build 82/82 页 exit0；主库78/项目库3迁移均最新。重启前两库 integrity=ok、外键无错误；与即时备份比较全表记录数不变，FinanceAccountProfile/PaymentRequest/ExpenseClaim/BillingRequest/FinanceAttachment 的旧字段逐值 SHA256 一致。BI 1510898 条，revenue=37235700.20128231、commission=7085058.905956274、units=1821056、totalFee=7294641.902263657 全部一致；未创建生产测试票据/付款或清理业务数据。
- PM2 重启 PID2598735 online、login HTTP200。在线合成 PDF 测试1页124903 bytes 成功，含脚本启动总耗时9.96秒；Chrome 峰值 PSS688.8MB、MemAvailable最低483.5MB；期间27次login全部200、最大58ms，结束Chrome进程0。此前停服 smoke 峰值743MB。服务器仅2GB RAM/2GB swap，以上不是并发或真实业务全链路压测，不能保证无卡顿；保持单进程串行渲染/有限队列，集中导出仍有内存风险。
- 启动最初错误日志未增加；随后新增173 bytes为 `Failed to find Server Action "x"` 的部署版本不匹配提示，不能说上线后完全无日志。旧页面需刷新，持续复现时再定位请求；日志尾部 sales/upload P2028 属部署前已有。真实付款核销/用户票据下载仍需人工业务验收，未用生产真实付款冒充测试。

## 2026-11-05 财务两轮修改发布准备（用户手动部署）

- 用户授权将本轮及上一轮全部相关修改commit/push，并要求完整手动部署代码；不授权代执行生产部署。本次无新Schema或迁移，不执行回填/清理。
- 生产只读预检：版本72ec95d、Ubuntu22.04.5、Node20.20.2，无chromium/google-chrome；daily最新2026-11-05 03:01:27 +0800、1506578432bytes、integrity=ok。部署须stop PM2确认后即时备份，npm ci安装新依赖，再安装Chrome及系统库；scripts/invoice-pdf-smoke.ts加载生产.env，仅内存生成合成PDF并检查有效性，不写DB、不保存文件，须通过后build再核对DB并重启。
- 本地新smoke首次受限执行出现Chrome启动60s超时，沙箱外复核exit0：1页124898bytes，未创建业务数据；不能将受限环境超时隐瞒为通过。类型检查/回单规则和既有真实PDF渲染验证通过。生产尚未执行任何写入或部署。

## 2026-11-05 付款凭证下载与Invoice预览/导出同版（本地，未提交/部署）

- 用户实测TEST-PAY-002下载失败。只读核对当前预览库：PAID记录保存`/uploads/7fbdb7ed-2e5b-4cb2-9f88-eb1d48229379.docx`且文件存在，并非占位；下载接口只查询附件表，而历史PAID仅写paymentProofUrls，导致404。现新核销在同事务创建FinanceAttachment/PAYMENT_PROOF；旧回单只读查PAID记录并JSON数组精确URL匹配后执行原申请人/模块权限检查，不回填旧数据。TEST-EXP示例中的example.com占位仍不是文件，不伪造。
- 下载按钮本地fetch检查状态再blob下载，401/404/网络错误在独立弹窗显示；外链仅HTTP(S)新窗口，example.com明确提示演示占位；不代理请求外部网址。
- tsconfig.json排除output生成目录，避免隔离构建副本被重复纳入源码类型检查；真实src、scripts及.next/types仍检查。
- 用户要求导出与原实时预览一致，已废弃独立Canvas版式：invoiceDocument.ts为唯一HTML/CSS模板，InvoiceEditor iframe与generateInvoicePdf(Puppeteer)共用。固定A4宽、64x64 Logo容器object-contain、Tinos常规/加粗及SourceHan中文兜底，两端相同字体与布局。已嵌入开放字体及许可；原PDF函数签名/邮件下载调用不变。
- 新增运行依赖puppeteer24与@fontsource/tinos，next serverExternalPackages增加puppeteer。正式部署必须先npm ci，安装/确认Linux Chromium和运行库（或PUPPETEER_EXECUTABLE_PATH），再执行真实PDF smoke测试；不能仅git pull+build就认定PDF可用。本地用已有Windows Chrome测试，不下载安装额外浏览器。单进程单渲染、最多5排队；缺浏览器明确报错，不降级旧Canvas。所有文本转义、固定资产dataURL、禁止PDF渲染器远程抓取。
- 无Schema/迁移/生产数据修改。TypeScript、付款/报销回单精确匹配规则、截图附件存储事务回滚测试通过；真正生成3页PDF，screen/print同数据布局及字体粗细指标一致，4字体已加载，PDF内嵌Tinos Regular/Bold、文本可抽取、PNG目视正常。隔离Next整合生产build82/82页exit0（本次本机耗时异常长，不能外推线上性能）；浏览器UI工具仍报告Work禁用，未绕过。测试文件仍output/pdf/invoice-logo-ratio-test.pdf（名称沿用旧测试）。本轮覆盖下方早期仅Logo比例修复；未commit/push/部署。

## 2026-11-05 财务核销反馈、开票截图附件及PDF Logo（本地修改，未提交/部署）

- 核销无反馈的确定问题：FinanceWorkbenchClient仅把错误放在开票区域，付款tab/核销modal不可见；缺必填字段时按钮静默禁用、请求异常未捕获。现改为modal内红色alert、点击提示缺项、异常捕获，保留输入及已上传凭证，多文件部分成功也保留。后端审批/付款权限与状态保护未放宽；未在生产执行真实付款，具体业务拒绝原因需由新错误提示定位。
- Invoice PDF原竖向Logo1765x2107被固定150x62拉伸，已改contain等比缩放，首页/续页、下载及邮件共用。4页回归PDF和首页/续页PNG验证无压扁或重叠。
- 客户开票资料银行账号/开户行/银行地址改为选填，前后端仅对CUSTOMER_BILLING放宽账号；其他收付款类别仍要求账号。空账号不参与重复银行账号校验。
- 国内及Invoice开票申请共用“请上传客户确认金额截图”，支持本地、多文件、粘贴、HTTPS外链。上传中锁定重复上传和链接编辑，禁止提前提交；链接不合法明确提示。复用FinanceAttachment：BILLING_STAGED本人暂存，提交事务校验上传人后原子转BILLING_REQUEST/CUSTOMER_AMOUNT_CONFIRMATION。审核、财务详情及本人进度均可查看；临时文件仅本人可读，正式截图按申请人/指定审核人/内部开票READ权限访问。不暴露到PDF中，不读取外链内容。
- 付款详情类型由financePaymentLabels映射为前端选项中文，不再展示AFFILIATE等代码。
- 无Schema/迁移，无生产数据修改。隔离预览仍3001连接backups/finance-payee-20261103-01/engine.db和projects.db。附件存储/归属/去重/不安全链接拒绝及中文付款类型测试在该副本事务中全部回滚；TypeScript、diff检查、4页PDF比例及视觉验证、最终隔离生产构建82/82页通过，本地login HTTP200。浏览器工具报告Work设置禁用本地浏览器，未绕过，UI交互及真实付款核销仍需人工验收。未commit/push/部署；勿提交.claude设置、output及scripts/_payment-ui-patch.cjs等既有/临时产物。

## 2026-11-03 财务收款资料及付款可选关联已部署：7411c63

- 用户在部署清单后明确确认部署，覆盖下方手动部署交接和本地未发布状态。业务7411c63已push并上线，拉代码后先停PM2并确认stopped，再备份、迁移、完整构建；82/82页成功，主库78、项目库3迁移均最新。
- 停服后独立即时备份`/root/www/backups/dev_manual_finance_7411c63_20261103_01.db`，1506578432 bytes、0600，完整性ok、外键无错误。构建另备份`/root/www/backups/dev_pre_deploy_20261103_175648_681.db`和`/root/thrive-data/project-backups/projects_pre_deploy_2026-11-03T09-58-00-147Z.db`。独立manual保留，旧部署前备份按原仅保留1份策略轮换，没有清理业务数据。
- 重启前只读对比即时备份：FinanceAccountProfile/PaymentRequest/ExpenseClaim所有旧列逐值SHA256一致，各业务表记录数一致；SalesRecord1357614条，revenue36228561.86127807、commission6743969.260356801、units1821020、totalFee6933604.988913757完全一致。新增3列历史值均NULL，新迁移成功；主库/项目库integrity=ok、foreign_key_check无错误。
- 所有检查成功后才重启，PID1956742 online、localhost:3000/login HTTP200。错误日志最后写入仍部署前2026-11-03 17:42:55 +0800，大小17113790，无本次启动新增错误。未在生产创建测试数据或付款申请，保留生产.env及原未跟踪文件。无回滚。

## 2026-11-03 财务收款资料发布交接（手动部署）

- 用户要求将下述财务账户和可选关联两轮修改一起commit/push GitHub，并仅提供手动部署代码；不代执行生产部署。独立发布审查无阻断问题，规则/TypeScript测试通过。
- 只读查询生产当前版本0683e21，最近每日备份2026-11-03 03:01:20 +0800，文件dev_daily_20261103_030001.db，1506578432 bytes，integrity=ok。实际部署仍须停PM2后即时备份，不能将今日凌晨备份当作即时回滚点。新迁移仅3条ADD COLUMN；不要在生产执行测试夹具、回填或清理脚本。

## 2026-11-03 渠道/联盟付款关联改为可选（本地，未提交/部署）

- 用户明确取消渠道商/联盟商付款必须关联票据和到账的限制，两项都空、只选一项或都选择均可提交。前端已有“可选”标签不变；服务端仅在提供ID时校验有效性，两项都选时仍校验有效到账核销与票据匹配。审核、收款账户分类、自动渠道付款来源规则保持不变。
- 新增paymentReferences.ts及payment-optional-references-test.ts，覆盖未选、只选票据、只选到账、均选择、无效引用及不匹配核销。无新增Schema或迁移，不清理/回填历史。此条覆盖下方账户改造记录中“现有关联规则未改变”的过程描述。

## 2026-11-03 联盟商银行资料及付款完整快照（本地修改，未提交/部署）

- 用户单独确认非破坏性Schema变更：`20261103120000_finance_payee_holder_fields`仅向FinanceAccountProfile新增可空accountHolderType/accountHolderMobile/accountHolderEmail，分别表示personal/business、持有人手机、邮箱；Checking/Savings复用bankAccountType，其余复用已有银行/地址字段。无DROP、DELETE或历史回填。
- 联盟商收款资料按用户指定中英文字段展示，名称支持资源库搜索或手填；币种为32种常见币种下拉，两个账户类型分别下拉。旧SWIFT等仍保留；编辑时不再把原联盟商关联ID误替换为资料ID，未提交的附件/默认标志保持原值。旧非标准bankAccountType可原样保留，新建/改值仅Checking/Savings。失败时保留表单并显示显著错误。
- 付款前端及后端同步分类匹配：CHANNEL->CHANNEL_PAYEE、AFFILIATE->AFFILIATE_PAYEE、SUPPLIER->SUPPLIER_PAYEE/SUPPLIER_BANK；税费/薪酬/其他不限制现有收款账户类别。切换分类清空不兼容账户；选择后带户名/币种并展示全部资料。现有渠道/联盟付款关联已开票及已核销到账规则未改变。
- 提交付款时从数据库读取选定账户并保存明确白名单的完整不可变快照；审核/财务工作台和申请进度均展示快照，不从当前资料补造历史。旧快照缺值显示—。
- 本地备份：`backups/finance-payee-20261103-01/before.db`；来自上一轮BI预览副本，未迁移真实prisma/dev.db或生产库。原字段/各表SHA256在新迁移前后完全一致，integrity=ok、外键错误0，新字段历史均NULL。隔离engine.db通过Prisma78个迁移；本地3001仅连接该目录engine.db和projects.db。
- 规则测试及隔离存储事务回滚测试通过（完整字段、分类、前导零、后续修改不覆盖申请）；TypeScript/Prisma validate/diff检查通过。隔离Next.js production build 82/82页成功，项目库使用外置临时副本（首次检查因项目库位于工作区被安全校验拦截，修正路径后通过）。独立审查无剩余阻断问题。用户已登录本地预览测试，已观察到表单和完整账户带出，截图output/finance-payee-preview-20261103.png。没有向生产写数据；用户本地手工测试记录仅在预览副本。尚未commit/push/部署。

## 2026-10-28 BI 发布完成：7aa5147

- 用户在部署前清单及高危 Schema/重建提醒后明确确认部署。业务 commit `7aa5147` 已 push 并上线；先拉代码、停止 PM2 并确认 stopped，随后执行备份、完整 `npm run build`、迁移、数据核对，均成功后才重启。生产82/82页构建通过；主库77、项目库3迁移均最新。
- 停服后的即时独立回滚备份 `/root/www/backups/dev_manual_bi_20261028_release_7aa5147_01.db`（2026-10-28 13:08北京时间，815587328 bytes，0600）检查完整性ok、外键无错误。构建另备份 `/root/www/backups/dev_pre_deploy_20261028_144459_661.db`；项目库备份 `/root/thrive-data/project-backups/projects_pre_deploy_2026-10-28T06-47-01-570Z.db`。独立manual备份与11:18备份均保留，不能擅自删除；自动pre_deploy按既有策略轮换1份。
- 重启前以只读连接比较即时备份和真实生产主库：1,351,966条SalesRecord全部40个旧字段逐值SHA256均为 `49b80ea811fbd9896def717b7ec09f15c6807f9035329b9be139bae26f52509d`，记录数、GMV/佣金/销量/总费用完全一致；其他业务表记录数一致，只有_prisma_migrations新增本次1条成功记录。原索引/触发器保留，历史记录新增4字段均为NULL，主库/项目库完整性ok、外键无错误。
- PM2重启后online，localhost:3000/login HTTP200，错误日志最后写入仍是部署前12:30（大小17070302 bytes），未出现本次启动新增错误；启动后105秒复核状态稳定。保留服务器原.env等未提交文件，验证Python缓存为非业务产物。没有执行历史BI清理、回填、0转null或测试数据导入，未触发回滚。以下“本地未发布”段落为发布前过程记录，本次代码现已上线。

## 2026-10-28 BI 可选字段、六平台映射与 Publisher ID 筛选（本地完成，未提交/发布）

- 用户确认 Schema 变更，并在得知 SQLite `DROP TABLE SalesRecord` 重建风险后明确回复“我已了解风险，确认执行”；用户最高要求是历史 BI 数据不得改写/清空，先备份，失败回滚。线上仅完成备份与只读校验，没有部署/迁移/清理业务数据，服务持续 online，login HTTP 200。
- 线上独立一致性备份：`/root/www/backups/dev_manual_bi_20261028_before_bi_optional_01.db`（778 MiB，0600），SHA256 `6b6a9d5b5229c26621eece5c7bf00a62bf5d7b4f8e8a1e58ef4417a61c021cae`。完整性 ok、外键无错误、1,351,966 条 SalesRecord；验证前后备份 SHA256 相同。该 manual 文件不匹配 daily/pre_deploy 清理规则，不能擅自删除。未来真实迁移前仍必须停 PM2、另做最新备份；不能回滚到今日旧快照而丢失后续新增业务。
- 新迁移 `20261028120000_bi_optional_publisher_fields` 仅重建 SalesRecord：新增可空 publisherId/publisherUrl/lockDate/lockStatus，unitsSold 与 conversionRate 允许空，新增平台+Publisher ID 索引，原5个索引保留。显式 BEGIN IMMEDIATE/COMMIT 保护，全部40个旧字段逐列原样复制，历史0不转null；不改其他业务表、不清理历史批次。仅在临时副本通过 raw SQL 和 Prisma migrate deploy 验证，真实本地主库和生产库均未应用新迁移。
- 数据保护脚本 `scripts/verify-bi-migration.py` 只接受新输出路径且源库只读。在完整线上备份副本上，旧字段逐值 SHA256、记录数、金额/佣金/销量总计与其他表记录数一致；模拟 DROP 后、rename 前失败并 rollback，旧表及全部数据完整恢复；两种结果均 integrity=ok、无外键错误。隔离验证产物留在服务器 `/tmp/thrive-bi-optional-20261028-a7d29c04/`，绝非在线数据库。
- 上传：店铺、ASIN、销量非必填；新上传缺销量为null、真实0保留、非法数量带行号报错；对应转化率不可计算时为null。新增 Publisher ID/URL、Lock Date/Status，ID文本保留前导零，URL不覆盖推广链接，状态不当日期。缺少完整品牌/店铺/地区/ASIN键时跳过自动补足。失败补偿只清理本次新建的暂存批次，不改既有批次。
- 新增 Impact/Rakuten/Webgains/AWIN/Tradedoubler/CJ 映射，既有12平台保留。用户明确 Impact `Click to Action` 直接映射 clicks，Tradedoubler `Period` 为具体日期；新6平台必须从源列提供地区，不默认US。Rakuten Lock Status/AWIN commission_status 入lockStatus，Impact Locking Date/Webgains Lock Date 入lockDate。
- 看板新增可搜索多选 Publisher ID，URL参数publisherIds联动角色范围内的看板/明细/导出；明细显示4个新字段，URL只允许http(s)点击。缺失销量显示—、部分合计有缺失标注，销量不完整时不以全量佣金除部分销量计算CPA。联盟商/项目/PDF下游同样适配null，不改销售额/佣金。共用筛选器补充展开状态/搜索名称，并修复窄弹层页脚按钮挤成竖排。
- TypeScript、prisma validate、导入规则/Publisher筛选/数据库存储/对账BI规则测试、数据保留及故障回滚测试、隔离主/项目库 Next.js 82/82 页构建通过。浏览器已验收桌面/窄屏搜索、前导零输入、无匹配状态、上传18个平台及提示；正向ID筛选数据库测试通过。未向真实BI写入测试数据，事务内测试夹具已回滚。
- 本地3001当前连接临时副本 `C:/Users/17863/AppData/Local/Temp/thrive-bi-optional-20261028-9c34a2bd/engine.db`（Prisma新迁移已记录），项目库为同目录projects.db；旧的确认书预览库及原dev.db保留不动。此副本8,672条旧BI记录日期截至2025-09，因此默认最近12个月看板为空并非数据丢失，批次列表仍完整。开发会话id17052。未commit/push/部署；不要暂存无关个人设置、output、压缩包、`scripts/__pycache__`和此前临时脚本。

## 2026-10-27 生产发布完成：e61f207

- 用户在部署前检查清单后明确回复“确认部署”；业务 commit `e61f207` 已 push 并部署到 `/root/www`。先停止 PM2 并确认 stopped，再执行完整 `npm run build`，成功后重启；82/82 页面构建通过。
- 主库构建前备份 `/root/www/backups/dev_pre_deploy_20261027_184106_495.db`，项目库备份 `/root/thrive-data/project-backups/projects_pre_deploy_2026-10-27T10-42-33-329Z.db`；备份策略仍每日超过 5 日清除、部署前仅留最近 1 份。此次仅按既有策略清理上一份部署前备份，不清理业务记录。
- 生产新增迁移 `20261027120000_legacy_billing_units` 成功；主库 76、项目库 3 个迁移均最新。两库 `PRAGMA integrity_check`=ok，`foreign_key_check` 无输出。PM2 online，localhost:3000/login HTTP 200；18:53（北京时间）复核错误日志最后写入仍为部署前 18:23，未见启动后新增异常。
- 未执行任何历史账单转换、初始化、测试、回填或清理脚本；已有旧合同收费身份仍需人工核对后显式初始化。生产原有 `.env` 修改、backup_db.sh、签章图片及 scanner_linux 保留。以下“本地未发布”段落是本次发布前的历史过程，业务代码现已上线。

## 2026-10-27 终止范围与历史合同确认书激活修复（本地修改，未发布）

- 合同详情右上角终止弹窗改为“整份合同”或“仅终止所选部分”；后者可同时勾选原合同固费/佣金与多份生效确认书，服务端在一个事务中校验并终止，任何失败整体回滚。终止日期及原因仍必填；终止协议/补充文件改为可选，选择时验证确属该合同且已上传。已有确认、开票、结算、收款的受影响对账仍阻止终止。
- 历史合同确认书独立选择启用中的公司收款账户，生效时保存每份确认书自己的账户快照；新格式主合同确认书仍限主合同账户。旧合同不再因缺少单独的主合同原件而阻断已上传签署确认书生效，确认书自己的签署原件仍必需。已上传原件但仍是草稿的记录可重试生效或重新上传，内部 EDIT 用户可重试。
- 发布审查修复：客户结束合作或整份合同终止遇到已确认/开票/结算/收款的对账记录时，保留该记录原周期和状态并审计，不再错误阻断整项终止；只有部分计费项目终止仍严格阻断受影响的财务历史。FRAMEWORK 主合同终止弹窗不再展示不适用的旧计费项目初始化入口。
- 本地预览数据 THRAIVE-2026-023-001 曾为 DRAFT v2、已上传原件、主合同 fileUrl=null、无确认书对账；随后 ACTIVATE v3 生成 25 条确认书对账（13 固费、12 佣金）。进一步只读复查显示该记录已由用户测试操作 TERMINATE v4（终止日 2026-10-30、审计备注“测试”），未来 23 条计划因此取消、当前两条仍 OPEN；这不是激活默认取消。不要再次创建、回填或修改该测试记录。
- TypeScript、确认书草稿规则测试、git diff --check 通过。未执行生产构建、commit、push、部署；当前工作树还含此前已获用户确认但未发布的 legacy billing unit Schema/迁移，不能将本轮描述误认为已上线。

## 2026-10-27 旧合同与新增确认书并行计费、分级终止（本地修改，未发布）

- 用户已按项目数据安全规范单独确认非破坏性 Schema 变更。新增 `ContractLegacyBillingUnit` 与 `CustomerReconciliation.legacyBillingUnitId`，迁移仅 CREATE TABLE/INDEX、ALTER ADD COLUMN，无 DROP/DELETE/TRUNCATE；仅在专用临时空库完成主库 76 个迁移及项目库 3 个迁移，未迁移现有业务库。
- 旧品牌合同原固费和佣金建立稳定计费身份；已有旧账但尚未人工核对来源的合同不会因打开财务页而自动初始化，需从合同详情显式核对。仅将无财务历史且属于当前/未来周期的单一类型草稿记录保守关联；历史已确认/开票/结算/收款记录保持不动。原合同与确认书并行显示、并行生成，来源在对账和 Invoice 预填明细中标记。无固费合同不建固费计划。
- 旧合同确认书可独立上传签署原件并生效；收款账户现在按每份确认书从有效公司账户中独立选择并冻结快照，无需先关联旧主合同。客户终止覆盖所有关联合同、其确认书和原计费项目；整份合同终止同步处理全部子项；原合同固费/佣金可单选或与确认书一起终止，补充文件可选，已有财务历史受影响时会预检阻断部分终止。
- BI 拉取和单条/批量提交增加跨旧合同与确认书的范围重叠防双计；范围不明确时保守阻断，不能自动将同一销售额计入两项佣金。旧合同 BI 范围优先使用冻结快照。
- 已通过 TypeScript、规则测试、专用临时库计费/终止/历史保护测试，以及隔离主/项目库下 Next.js 82/82 页面生产构建。未 commit、push、部署。待人工确认旧合同是否包含多个同类独立项目：现有旧合同结构只保存一套固费与佣金条款，当前自动拆分为这两条；无法凭现有字段安全推断多个同类项目，需逐份核对，不能自动拆分。

## 2026-10-15 项目确认书创建方式与内部员工权限（本地完成，待发布）

- 项目确认书“新建”始终先显示新增/替换及在线填写/上传签署原件四种处理方式；没有已生效确认书时禁用替换并说明原因。修复已有生效确认书的替换草稿被旧签署原件遮挡上传入口的问题。
- 拥有 `contracts.records` EDIT 的已启用内部员工可在已签署主格式合同下新增、修改、替换和终止项目确认书；主合同资料编辑、确认书改编号、草稿删除和手工激活仍沿用原权限。合同详情空状态的新建入口独立于主合同编辑权限。
- 终止要求日期、原因和当前版本，保留审计；终止或替换如会影响已确认、已开票、已结算或已收款的未来对账记录，返回冲突而不静默取消财务记录。
- 无 Schema、迁移或业务数据改动。`npm.cmd run typecheck`、确认书草稿/计费规则测试、`git diff --check` 及使用临时外置项目库路径的 Next.js 生产构建（82/82 页面）通过；未执行会自动迁移数据库的完整 npm 构建，未部署。生产截图所示 `THRAIVE-2026-031` 原为 SIGNING 且对应内部员工默认有 EDIT，若该具体页面仍无按钮，需进一步核对当前 URL 与接口响应。

## 2026-10-12 用户移交接收角色改为建议（本地完成，待发布）

- 管理员移除用户时，前端候选开放为所有已通过审核且非待移除用户的账户；后端移除渠道关联数据只能移交给 CHANNEL 的限制，保留管理权限、有效接收账户、自身移除及最后管理员保护。
- 预览字段改为 `hasChannelAssociations`；按渠道关联或原账户角色推荐接收角色，选择其他角色仍可提交。弹窗说明品牌绑定、渠道客户访问及角色专属流程的影响。
- 接收账户现有权限及下游渠道业务角色校验保持不变；跨角色移交可能影响渠道对账、付款或部分记录的可见性，页面已明确提示。
- 修改文件：`src/app/(app)/admin/AdminClient.tsx`、`src/app/api/admin/users/[id]/route.ts`。无 Schema 或 Migration 变更；TypeScript、`git diff --check`、完整 `npm run build`（82/82 页面，项目库使用临时副本）及独立只读审查通过。未对真实账户执行移除。用户已授权提交、推送和直接部署；发布前确认生产 75 个主库迁移与 3 个项目库迁移均已应用，每日备份日志最新为 2026-10-12 03:01:22、integrity=ok。

## 2026-10-12 管理员移除用户时外键移交失败（本地完成，待发布）

- 两个 `CLIENT-*` 报错均定位到管理员“移除用户并移交数据”。生产只读核对确认：梁钰涓仍关联 5 条 `BillingRequest.applicantId` 和 6 条 `FinanceAuditLog.actorId`；吴晓蓉仍关联 163 条 `FinanceAuditLog.actorId`。现有事务遗漏这些必填外键，最终删除用户时触发 SQLite 外键约束。
- 用户移交影响预览及删除事务已补齐 9 类原先遗漏的强制用户关联：对账周期审计、开票申请、客户到账、到账核销、渠道业务文件、渠道付款、财务审计、合同补充文件和财务账户资料。
- 删除接口新增统一 `errorResponse`，后续未覆盖异常会返回可追踪的 JSON 错误并进入系统错误记录，不再退化为无法定位的 `CLIENT-*`；邀请关系移交排除接收人，避免形成“自己邀请自己”。
- 无 Schema、Migration 或生产数据修改。TypeScript、`git diff --check` 和使用临时独立项目库副本的 Next.js 82/82 页面生产构建通过；尚未 commit、push 或部署。

## 2026-10-10 Invoice 申请备注、开具通知与申请人下载（本地完成，待发布）

- Invoice 申请每条明细备注随申请保存，审核弹窗、财务工作台详情和申请进度均展示纯用户备注；历史 `INVOICE_META` 内部元数据继续兼容且不会直接暴露。
- 财务受理后进入 Invoice 编辑器时，每条明细备注自动填写到对应项目描述；备注为空继续使用原有自动项目描述，编辑器不再覆盖申请预填内容。
- Invoice 完整开具并使申请首次进入 `COMPLETED` 后，在同一事务内向申请创建人发送一次站内信并跳回对应申请；部分开具不提前通知。
- 申请人的开票申请详情新增已开具 Invoice 下载入口。内部申请人可下载自己申请生成的 Invoice；其他内部账号仍需 `finance.invoices` 读取权限，外部账号仍禁止访问。
- 无 Schema、Migration 或业务数据修改；TypeScript 与 `git diff --check` 已通过。

## 2026-09-18 财务三类申请统一审核与集中处理（本地完成，待提交）

- 开票、付款和费用报销统一必选审核人，默认 `shallow.w@thraiveagency.com`；可改选已启用内部账号。非管理员不能自审，管理员允许选择自己作为审核人。
- 付款与报销新增审核人选择、审核前改派、审核通知和结果通知；审核人的首页待办及站内信均跳转至财务工作台“付款与报销”的对应详情。
- 财务工作台开票记录与付款/报销记录增加单条及批量通过、批量退回、批量删除；退回和删除必须填写原因。付款/报销详情展示申请人、审核人、事项、状态和付款凭证，申请人可下载凭证。
- 删除使用现有 `CANCELLED` 软删除并保留审计；已产生发票、收款或付款凭证的记录禁止删除。审核通过、退回、付款完成均向申请人发送站内信。
- 无 Schema、Migration 或业务数据修改；`npx.cmd tsc --noEmit --pretty false` 通过，尚未 commit、push 或部署。

## 2026-09-18 开票审核通知、待开票状态与 Invoice 费用类型一致性（本地完成，待提交）

- 开票申请提交后在同一事务中向指定审核人创建 `BILLING_REVIEW` 站内信；首页工作台新增“开票申请待审核”，站内信与待办均精准跳转并展开对应申请。改派审核人时撤销旧审核人的未读提醒并通知新审核人，审核完成后对应提醒自动标为已读。
- 财务工作台开票记录读取第一步审批状态：未审核显示“待审核”，通过后绿色显示“审核通过 · 待开票”；只有第一步已通过的申请才显示“受理并开票”，避免未审核记录被误受理。
- 隐藏开票列表及审核详情中的申请备注/内部 `INVOICE_META` 文本，但继续保留其后台 Invoice 预填用途。
- Invoice 费用类型补齐 `SINGLE_CHANNEL_FEE`，申请、预填编辑器、项目描述、保存校验和 Invoice 列表统一显示“单渠道费用”，不再错误回退为“月度服务费”。
- 无 Schema、Migration 或现有业务数据修改。TypeScript 与 `git diff --check` 通过；尚未 commit、push 或部署。

## 2026-09-18 备份保留策略收紧（本地完成，待提交/部署）

- 新增受版本控制的 `scripts/backup_db.sh`：保留原每日 03:00 SQLite 在线完整备份、非空检查、`integrity_check=ok`、600 权限及日志流程，仅将每日备份清理阈值从超过 30 日改为超过 5 日（`-mtime +5`）。生产 cron 目前仍指向未纳入 Git 的 `/root/www/backup_db.sh`，部署时需改为 `/root/www/scripts/backup_db.sh` 或同步替换。
- 主库与独立项目库的每次部署前备份改为仅保留最新 1 份；先解析真实 SQLite URL，写唯一临时文件，完成 SQLite `integrity_check` 后原子改名，最后才严格按各自文件名前缀清理旧备份。新备份失败时不清理历史备份，manual/daily/WAL/SHM/日志等其他文件不匹配、不删除。
- 无 Schema、Migration 或业务数据修改。Node 语法检查、临时 SQLite 成功清理测试、损坏备份拒绝且旧备份保留测试、`git diff --check`通过。生产磁盘仍为 100%，本轮尚未删除生产备份、commit、push或部署。

## 2026-09-04 网站说明与维护交接文档（本地完成，待提交）

- 新增登录后 `/guide` 网站说明页，并在侧边栏底部增加所有角色可见的“网站说明”入口；内容按快速开始、核心业务流程、模块说明、角色权限与常见问题组织，复用现有 Clear Operations Console 设计语言。
- 网站说明根据当前登录角色展示身份提示；具体模块仍由原有功能权限和品牌/渠道数据范围控制，不改变任何授权逻辑。
- 生成独立维护交接文档 `deliverables/Thrive_Hub_网站维护交接文档.docx`，不位于网站路由或 public 目录；涵盖系统结构、双 SQLite、权限、部署停机顺序、备份恢复、故障排查、技术债与验收清单。
- 无 Schema、Migration 或业务数据修改。TypeScript 检查通过；交接文档已用 Word 渲染并逐页检查 10 页，无内容截断或重叠；使用外置隔离项目库完成 Next.js 82/82 页面生产构建。

## 2026-09-03 合同上传表单恢复值误判修复（本地完成，待提交）

- 根因确认：渠道商上传页原先不是原生 form，提交只读取 React state；浏览器历史恢复/自动填充可让客户下拉框显示已选值，却不触发 React onChange，因而在请求发出前误报“请选择关联客户”。
- 渠道商上传已改为标准 form，客户、负责人、乙方资料、日期、比例和文件统一从提交时页面实际 FormData 读取；客户 state 仅保留联动带出用途。
- 同步修复事务性合同上传的日期/文件提交，以及历史“上传已有合同”入口的客户和文件 DOM 实值兜底，避免相同的界面值与 state 脱节。
- 服务端客户范围与 customerId 解析经审查正常；权限失败文案与截图不同，未改数据库或权限口径。
- 无 Schema、Migration 或业务数据修改。TypeScript、diff check、外置项目库 Next.js 81/81 页面生产构建通过；尚未 commit、push、部署。

## 2026-09-03 合同分类首页、专属归档合同与 BI 可选映射字段（本地完成，待提交）

- 合同首页按品牌方、渠道商、事务性合同拆为三个页签；品牌方保留原宽表和多确认书展开，渠道商与事务性合同使用各自精简表头并直接下载签署原件。
- 渠道商返佣合同改为专属上传表单：甲方默认 Thraive 公司资料，乙方公司/联系人/电话/邮箱手填，保存起止日期、固费乙方比例，以及固定 USD 4,400 阈值、低于 15%、达到或超过 25% 的联盟运营佣金规则。合同、原件和合同级分账规则同事务创建并直接签署完成，不生成品牌方对账计划。
- 事务性合同只需填写起止日期并上传签署原件，保存后直接签署完成；详情页右上角只保留下载原件。
- BI 上传新增两个非必填映射项“链接标签”和“父ASIN”，复用 SalesRecord 现有字段；上传值优先，空值仍允许 ASIN 映射表补足，看板现有维度直接显示。
- 无 Schema、Migration 或业务数据修改。新增 BI 可选字段测试；相关测试 8/8、TypeScript、diff check、隔离项目库 Next.js 81/81 页面生产构建通过。

## 2026-09-02 项目确认书保存/签署归档与合同创建方式（本地完成，未提交）

- 修复确认书编辑误判未保存：打开既有记录不再强制覆盖 `workflowMode`；保存成功后编辑区自动折叠，失败或版本冲突时仍保留表单。
- 签署原件入口移至确认书列表“修改草稿”后方，使用服务端最新行版本上传；上传后立即签署生效并独立生成对账，移除旧的底部长表单上传及手工生效提示。
- 上传已有品牌方合同下的每一份完整确认书（不再只限第一份）均复用已签署主合同原件，保存字段后自动关联原件并生效。主合同来源优先显示为“随上传已有合同归档”。
- 确认书列表新增创建方式及“已上传签署原件”标识；合同首页末列新增创建方式，完整区分网站创建、上传已有、事务性合同、渠道合同归档及历史记录。
- 无 Schema/迁移或业务数据变更。`npm run typecheck`、确认书字段测试、计费规则测试、隔离项目库 Next 80/80 页面构建通过；现有 schema 测试脚本因 Prisma 弃用警告写入 stderr 自身返回失败，与本次变更无关。本地 3001 已清理 `.next` 可再生缓存后恢复，login HTTP 200。
- 本轮仅修改确认书 UI、两个确认书 API、合同列表及本交接文件；未 commit、未 push、未部署。

## 2026-08-31 主格式合同/项目确认书阶段3（进行中，未提交）

- 本轮续改：FRAMEWORK合同详情已完全分流旧详情，按主合同/确认书/签署原件/附加条款分类；确认书以主合同下分栏切换展示国家、平台、Program、第三方平台、商品范围、收费、数据源及付款条款。合同列表FRAMEWORK使用新主合同完整性，不再套旧收费字段；草稿显示“待上传盖章版”。本地详情与列表只读验收通过，375px无页面横向溢出、浏览器无console error。
- 导出保留原V3.2模板全部可选项，销售平台、Program、第三方平台、商品范围、收费模式、销售数据来源分别以☑/☐表示；自定义项写入“其他”，不再把未选择项删掉。三种导出范围结构及未修改其余OOXML部件测试通过；仍缺LibreOffice视觉渲染，不能宣称Word分页完全验收。
- 签署闭环：新建主合同始终DRAFT，导出不改状态；资料完整且上传双方盖章版后才COMPLETED并推动客户合作中。上传已有主合同要求同一套完整字段、签署确认及真实PDF/Word后直接COMPLETED。新增盖章版私有鉴权下载、乐观锁、魔数、20MB、版本和审计；FRAMEWORK禁止走旧审核/手工完成状态。确认书上传盖章版后如字段实际变化，当前signedFileUrl失效，旧文件只保留在历史版本，必须重传才能生效。确认书生效再次验证主合同完整性和真实签署文件。
- 新建合同导出后，合同详情不再要求重复补录或在上传时再次执行完整性拦截：直接展示此前保存的数据，必要时先编辑，不修改则一次上传“主合同 + 所选项目确认书”盖章完整版。完整性仍由创建/编辑/导出环节负责；归档只验证权限、文件真实性、并发版本和确认书归属。系统在同一事务中完成主合同签署归档，并把同一完整原件关联到本次勾选的确认书；详情页可直接下载该完整原件，确认书仍需逐份确认生效并独立生成对账。
- 尚未完成且不能宣称完成：合并文件自动分拆/识别；单独项目确认书上传时选择主合同和新增/替换；确认书上传字段自动识别；Project.projectConfirmationId业务/UI关联；CAMPAIGN/PUBLISHER订单核定、尾期/附加项目费计划。上述后续不能复用旧AI合同映射硬套新字段。
- 用户已确认新增 User.phone、FinanceAccountProfile.legalEntityKey、ContractTemplate.documentType、Project.projectConfirmationId；迁移 `20260831190000_contract_document_classification` 仅 ADD COLUMN/CREATE INDEX。本地主库停止 Next、checkpoint 后备份 `backups/dev_pre_deploy_20260831_153512.db`，已应用到第73个迁移，integrity_check=ok、外键错误0；生产未动。
- 修复确认书 storeUrl 的空字符串/无效 URL 导致 new URL 抛异常：安全返回字段校验错误。草稿编号自动按主合同编号加序号；管理员改编号需原因/版本检查/全局去重及审计，作废仍占位。
- 模板按 BRAND_LEGACY/FRAMEWORK_MASTER/PROJECT_CONFIRMATION/CHANNEL_REBATE 分类，品牌方与渠道入口各有模板页；旧创建/上传/导出解析限定历史模板。新建/上传新品牌方合同共用 FrameworkContractForm，新建为草稿，上传原件归档；联系人可选内部用户带出邮箱/电话，管理员可维护用户电话。
- 主合同显示全部启用公司账户并多选；默认使用明确 legalEntityKey，历史无key账户按规范化公司名匹配。财务资料公司付款账户增加“关联合同签约主体”维护，未关联账户仍可手动选。新快照包含 routingNumber/payeeAddress/bankAddress；旧合同快照不随财务资料变化。
- 新格式合同编辑不再打开 ContractV4Form；新增 updateFrameworkContract，版本冲突保护、修改原因及前后审计，保留签署文件和已有账户快照。已有确认书引用的账户禁止直接移除；生效确认书存在时禁止换签约主体。旧 updateContract/updateContractV4 服务端拒绝 FRAMEWORK，避免绕过页面写入旧收费字段。
- Word导出实现基于用户V3.2模板的主合同/当前确认书/两者合并三种范围，仅在内存填充并下载；多账户/站点/收费字段结构测试通过，不改参考文件。尚未视觉验收：本机渲染脚本缺少 LibreOffice。不能宣称完整排版已通过。
- 本轮账户选择测试、URL/草稿测试、确认书规则、Word三范围结构测试和tsc通过；外置临时空项目库 next build 两次通过79/79页面，本地dev已恢复3001。最后追加账户历史保留及列表文案后再跑tsc。空SQLite绝对路径需先用node:sqlite初始化再跑prepare-project-db，否则Windows schema engine报无详细信息错误。测试库位于系统TEMP/thrive-contract-build-7f42f68881d3437ab591e8eed4ce9703，不指向现有项目/BI库。
- 页面只读验收：财务两家公司账户均可见，切换乙方正确切换默认勾选；375px单列表单，document.scrollWidth=375无横向溢出，已恢复桌面视口和原主体选择。未提交测试业务数据。浏览器日志仍保留08:29旧URL异常，当前源码已try/catch且草稿测试覆盖，不将历史日志误认为新回归。
- 主合同编辑允许保留已停用的既有账户快照，新选账户仍必须启用；脱离财务资料的历史快照不自动删除。停用账户在表单标注。确认书列表统一显示编号，不重复显示旧title。
- 未完成：整包主合同+确认书自动分拆/识别、确认书单独上传的主合同选择与新增/替换流程、新建主合同签署原件归档闭环、Project.projectConfirmationId业务/UI关联、导出完整字段/版面回归、阶段2列出的订单核定和尾期/附加费计划。新上传暂仍仅存主合同原件，确认书原件上传仍不识别；不可宣称用户本次全部需求已完成。
- 多Agent sow_api/sow_ui/sow_finance均因workspace credits耗尽退出，未完成交付；主Agent继续整合并验证其部分工作。未commit/push/deploy。不要暂存无关 .claude/settings.local.json、output、临时scripts或用户文本文件。

## 2026-08-31 主格式合同/项目确认书阶段2（本地代码，未提交）

- 新建品牌方合同入口增加“主格式合同 + 项目确认书”：归档已签署主合同，保存甲乙方基础信息、联系人、负责人，并从财务资料中按乙方主体多选一个或多个公司付款账户；创建后进入独立确认书页。旧版品牌合同上传入口保留并明确标注历史兼容。
- 项目确认书草稿/原件/生效 API 已接通：国家一行，销售平台、Program、第三方平台多选并支持自定义；月费、GMV服务佣金/总包佣金、存量/增量/全量基数、商品与数据源写入版本快照。确认书只能选择主合同冻结的收款账户；签署原件必须真实存在才能生效。
- 每份生效确认书独立生成固费及佣金对账，主格式合同不再走旧合同整套计划，多个同期确认书互不覆盖；订单唯一归属键统一NFKC及大小写，防止同一订单跨确认书重复计佣。
- PACKAGE总包佣金在每期对账必须人工保存实际比例后才可提交/审核/开票；CAMPAIGN/PUBLISHER在订单归属核定入口未完成前保持阻断，禁止错误使用客户总GMV。固费开票金额使用异议确认后的finalFeeAmount。
- BillingRequestLine、InvoiceItem及国内发票明细传递projectConfirmationId；跨合同/跨确认书合并开票仍允许，但每行保留来源。确认书生效业务校验改为明确4xx/409，不再污染系统错误表为未知500。
- Schema及迁移沿用用户已确认的20260831150000_contract_confirmation_foundation，纯CREATE/ADD，无DROP/DELETE/TRUNCATE；本地主库72迁移最新。纯规则、草稿、隔离迁移/零漂移测试、全量tsc和Next 79页构建通过；完整npm build的项目库准备步骤因Windows临时绝对SQLite URL报schema-engine错误，随后独立next build在外置项目库环境变量下成功。端口3001开发服务已恢复，浏览器只读验证主合同入口及THRAIVE/灵跃账户联动，未创建业务合同。
- 尚未实现/不可宣称完成：CAMPAIGN/PUBLISHER订单核定操作页、历史确认书版本原件下载、合同终止尾期规则、附加项目费付款计划。未commit、未push、未部署。

## 2026-08-31 主格式合同/项目确认书阶段1（本地代码，未提交）

- 用户确认：客户→主格式合同→确认书分栏；多份生效确认书独立计费，同期不覆盖。同一订单仅归属一份；总包值在合同记录，对账提醒人工核定实际抽佣比例。乙方多收款账户；国家一行、多平台/Program/第三方平台选项支持手动新增。
- 具体方案见 docs/contract-sow-redesign-plan.md。用户在Schema新增提醒后明确确认，已新增6表及Contract/CustomerReconciliation/InvoiceItem/BillingRequestLine/ManualBillingRequestItem的可空字段。迁移20260831150000_contract_confirmation_foundation仅CREATE TABLE/INDEX和ALTER ADD COLUMN，无破坏性操作；业务库未应用。
- 新增contractConfirmationDraft.ts（草稿/生效条件、国家多行、多账户、版本化快照）及contractConfirmationRules.ts（明确百分数、独立周期键、超门槛、PACKAGE本期比例确认、核定GMV与币种校验）。不调用旧计算器、不写业务数据、尚无API/UI入口。
- 两份纯逻辑回归、prisma validate、全量tsc通过；contract-confirmation-schema-test.cjs在临时合成空库验证迁移、旧字段保留、订单唯一性、多账户/范围、完整性、零Schema差异。此测试固定旧schema版本4bb722f并依赖node:sqlite，本地Node24通过。尚未generate客户端/应用业务库迁移，也未运行自动迁移的npm run build。
- 后续：先备份并应用本地迁移，再接权限保护的主合同/确认书创建上传、生效版本、独立对账、订单归属及开票回传。须先分离legacy与FRAMEWORK路径，禁止主合同再重复生成一套费用；生效前校验客户/合同/账户归属。尾期、项目费等未实现，不可宣称全部功能完成。权限沿用canonical leaf，ADMIN/USER按功能权限全量数据。旧记录不转换、不重算。未commit/push/deploy。

## 2026-08-31 系统错误查询（已部署 4bb722f）

- 经用户确认已部署4bb722f：生产停止PM2后构建，备份 /root/www/backups/dev_pre_deploy_20260831_103533.db；新增日志表迁移成功，主库及备份 quick_check 均ok，项目库无待迁移。构建79页成功，PM2重启online；本机/公网login 200，未登录日志API401，管理员页307。未在生产制造测试异常或修改业务记录。此部署记录更新尚未提交。

- 用户确认新增独立 SystemErrorLog 表；迁移 20260831113000_system_error_log 仅 CREATE TABLE/INDEX，不关联删除业务数据。已备份本地数据库至 backups/dev_pre_deploy_20260831_101301.db 后 migrate deploy，生产未执行本迁移。
- 管理员面板新增“系统错误”，URL /admin?tab=errors；新增 canonical leaf admin.system_errors，默认仅 ADMIN MANAGE，后端还实时验证数据库角色 ADMIN 和 APPROVED，读 READ、更新 EDIT。
- GET /api/admin/system-errors 按追踪码/分类、模块、UTC+8 日期、状态筛选，每页20条；PATCH 更新处理状态/备注，已解决必填备注并记录解决人和时间。
- appError 的 normalizeError/errorResponse/actionError 接入 Next after 异步记录，CLI 回退异步；失败不阻塞原业务且不递归。AppError 保留原code/message并增加traceCode，响应头 X-Error-Code 用追踪号；未知错误仍 ERR。只覆盖统一错误处理入口，不保证捕获所有直接返回的4xx或未捕获异常，历史ERR不会补录。
- 不保存原始message/stack/meta/参数，只保留白名单类型、Prisma code和NaN/未知参数/缺少参数诊断标志。常见错误字典支持查询故障时显示。
- Prisma validate/generate/migrate deploy、独立tsc、next build（临时独立项目库环境）、脱敏/分类/leaf及route测试、真实API权限/筛选/状态保存和Next after请求结束落库、桌面和390px浏览器布局均通过。本地仅保留3条明确说明为测试的日志，均已解决，未改业务记录；端口3001开发服务已恢复。
- 本次新增源文件：SystemErrorsPanel.tsx、system-errors API、systemErrorCatalog.ts、systemErrorLog.ts、两份system-errors测试脚本及迁移；未commit/push/deploy。

## 2026-08-31 对账异议金额错误修复（已部署 d66479c）

- 生产追踪号 `ERR-MTCIXJVH-908871` 对应 batch-submit 的 Prisma 校验失败。固费异议缺少 correctedSalesAmount，被 Number(undefined) 转为 NaN 并写入 actualSalesAmount/finalSalesAmount；Prisma 误导性提示 Unknown argument submittedById，并非这次请求权限失败。
- 新增 resolveSubmissionAmounts 按固费/销售佣金分别取纠正金额，固费保留原销售额；入库前拒绝非有限值/负数，返回稳定业务错误码 RECONCILIATION_INVALID_AMOUNT。最终确认审计区分固费与销售额并记录纠正币种。
- 内部 ADMIN/USER 单条 DISPUTED 操作要求 EDIT；单条 APPROVED/最终确认仍要求 MANAGE。前端确认按钮同步 canManage，移除最终确认按钮的提交人限制；外部角色权限和 scope 不变。批量 SKIP_CUSTOMER 保留原有 EDIT 权限，不在本次收紧。
- 新增 scripts/reconciliation-submission-amounts-test.ts；--prisma 为本地零匹配 ID 校验，已复现 NaN 导致 submittedById 错误并验证有限值参数通过，修改业务行数为 0。
- 无 Schema/迁移。d66479c 已 commit/push 并经用户确认部署；本地完整 build、独立 tsc 和金额回归通过。生产先停止 PM2 后构建，备份 /root/www/backups/dev_pre_deploy_20260831_100210.db，两库均无待迁移；构建成功重启后 PM2 online、本机及公网 login HTTP 200、未登录 finance HTTP 307。未执行真实业务异议保存测试。生产 .env 与未跟踪文件保留。
- 管理员错误查询入口随后经用户 Schema 确认已本地实施，见本文顶部；尚未提交或部署。

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

# 2026-10-12 客户对账去重与 BI 分项核算（本地未提交）

- 自动与手工客户对账统一执行合同、类型及日期重叠校验，防止同一合同同一周期重复生成两套固费或佣金账；非品牌合同不参与客户对账。
- 固费只有在金额大于 0 且周期未明确禁用时才生成；项目确认书月费为 0 或未填写时不再生成固费对账。
- BI 拉取改为严格按“确认书品牌 → Region → 联盟平台 → 可选商品范围”过滤，并将金额保存为品牌/地区/平台分项快照；页面明确展示过滤口径，支持全量或单项刷新。
- 销售额异议支持逐项修改并校验明细合计；对账明细导出只取快照范围内的 BI 数据；Invoice 预填按相同明细拆分多个销售佣金项目并处理分摊尾差。
- 新增默认仅预览的 `scripts/cleanup-invalid-reconciliation-plans.ts`：仅允许软删除无财务关联的重复 AUTO 草稿和零固费 AUTO 草稿；`--apply` 还要求传入最新预览的 `--expect=N`。生产执行前仍须备份并取得明确授权。
- 本次无 Schema、迁移或业务数据修改。规则测试、TypeScript、`git diff --check`、Next.js production build（82/82）通过；完整构建使用隔离的临时外置项目数据库环境变量，本地正式配置未改。
- 尚未 commit、push 或部署；`.claude/settings.local.json`、`deliverables/`、`output/` 及其他既有临时文件不属于本次改动。

# 2026-10-12 已审核普通开票申请的 Invoice 开具修复（本地未提交）

- `MANUAL` 开票申请没有对账记录是合法情形；Invoice 保存按申请客户、合同、费用类型、币种及申请金额校验，`RECONCILIATION` 来源才要求对账关联。
- 开具页优先沿用申请提交时选择的收款账户；申请未记录有效账户时才从关联合同默认账户预填。切换客户时清空旧账户选择。
- 对账申请的 Invoice 明细允许由一个销售佣金对账拆为多行品牌/地区/联盟平台项目；编辑器保留项目确认书关联，不再把明细行数强制等同于对账记录数。
- 本次没有 Schema 或迁移；新增 `scripts/billing-request-invoice-rules-test.ts` 覆盖普通申请无对账和对账申请严格关联。TypeScript、规则测试、`git diff --check` 与 Next.js production build（82/82）通过；尚未提交、推送或部署。
