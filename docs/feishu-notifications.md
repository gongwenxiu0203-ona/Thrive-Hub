# 飞书个人通知接入

## 当前边界

- 只面向已启用内部 ADMIN / USER 账号；不是飞书单点登录，不替代网站登录。
- 独立通知配置，不覆盖原 `FEISHU_APP_ID/FEISHU_APP_SECRET` 表格同步配置。可以使用同一个企业自建应用，但需分别填写环境变量。
- 用户在账号设置主动绑定，站内信写入成功后定时推送标题与站内详情链接。不外发完整正文、银行资料、附件或财务备注。
- 绑定、重新启用后仅处理新产生的站内信，不补发历史；依据 `createdAt`，不依据将来的提醒日期 `remindDate`。个人暂停/解绑取消未完成任务。解绑时已经在途的请求无法撤回。
- 默认每分钟扫描一次，重试最多5次（60/120/240/480秒退避）；任务唯一键、原子领取、90秒租约及稳定消息UUID降低重复风险。飞书UUID去重有时限，不能保证绝对 exactly-once。

## 飞书管理员配置

1. 在企业自建应用启用机器人和网页应用/登录能力。
2. 申请 `im:message:send_as_bot`（以应用身份发消息）及登录用户基本信息权限 `contact:user.base:readonly`。只用 open_id，不需要批量读取通讯录、读聊天记录或申请用户长期离线授权。
3. 应用可用范围包含要绑定的员工；完成版本发布及企业审批。
4. 安全设置中的重定向 URL 必须与网站配置完全一致：`https://网站正式域名/api/settings/feishu/callback`。只接受固定配置的 HTTPS origin，不从请求 Host 推导。
5. 核对企业 tenant_key，不能用 App ID 或企业显示编号替代。若未知，可将凭证填入本地 Git 忽略文件 `.env.feishu-notify.local`，运行 `node scripts/feishu-notify-check.cjs`；此脚本只调用官方凭证/企业查询接口，输出非密钥企业标识，不发送消息、不保存 token。若权限不足，在飞书 API 调试台检查企业信息接口。

官方参考：[网页授权](https://open.feishu.cn/document/authentication-management/access-token/obtain-user-access-token)、[发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create)、[企业信息](https://open.feishu.cn/document/server-docs/tenant-v2/tenant/query)。飞书后台字段和权限名以当前控制台为准；真实企业授权仍需验收。

## 服务器配置（密钥不得提交Git）

在 `/root/www/.env` 独立添加以下配置，保留原项目数据同步凭证：

```dotenv
FEISHU_NOTIFY_ENABLED=false
FEISHU_NOTIFY_APP_ID=企业自建应用的AppID
FEISHU_NOTIFY_APP_SECRET=只在服务器填写真实Secret
FEISHU_NOTIFY_TENANT_KEY=经过核对的企业tenant_key
FEISHU_NOTIFY_CRON_SECRET=独立64位十六进制随机密钥
FEISHU_NOTIFY_STATE_SECRET=另一个独立64位十六进制随机签名密钥
NEXT_PUBLIC_APP_URL=https://网站正式域名
```

- 在安全终端用 `openssl rand -hex 32` 生成定时密钥，不能复用JWT密钥或把它放在URL里。
- 保持 `FEISHU_NOTIFY_ENABLED=false` 直到配置、数据库迁移、构建检查都通过。改为 true 并按正常发布流程更新进程环境后，个人才可以绑定和测试。
- Secret 仅保存在受限环境文件，OAuth用户 access/refresh token 不落库。授权state使用独立 `FEISHU_NOTIFY_STATE_SECRET`，不需要为了接入飞书而轮换原登录密钥；网站自身仍应单独维护安全的 `JWT_SECRET`，其轮换会影响旧会话，需另行评估。

## 发布与定时任务

数据库变更：`20261106120000_feishu_notifications` 仅新建 `FeishuBinding`、`FeishuNotificationDelivery` 表及索引；使用显式事务，无旧表重建、清理、回填。两个新表的级联仅用于个人解绑/删除时移除本人的绑定及配送状态，历史 Reminder 不会被删除，用户业务移交不移交飞书身份。

必须先执行项目部署前清单并得到批准。生产先停PM2确认stopped、做最新独立一致性备份，再执行迁移/构建；核对原表记录数及BI金额、完整性、外键后才重启。失败不要 reset、覆盖数据库或直接重启掩盖错误。文档并非部署授权。

部署完成并准备启用后，在保留既有 crontab 的前提下增加一条，不能整份覆盖：

```cron
* * * * * /usr/bin/flock -n /run/thrive-feishu-notify.lock /usr/bin/node /root/www/scripts/feishu-notify-cron.cjs >> /root/www/logs/feishu-notify-cron.log 2>&1
```

先核实服务器 node/flock 的实际路径并确保 logs 目录存在。脚本从服务器 `.env` 读取密钥，通过本机HTTP的Authorization请求头调用新cron路由；middleware只对此机器端点放行，路由仍独立校验密钥。不需要飞书事件订阅、外网Webhook或开启聊天读取。

## 验收顺序

1. 一个内部测试账号绑定自己的企业飞书；测试消息成功后才扩大使用。
2. 真实创建一条经用户同意的业务通知（不要用真实付款冒充测试），确认约1分钟内收到标题，点击跳转正确网站记录。
3. 验证暂停、重新启用不补发、解绑后不再投递、另一企业/同飞书重复绑定被拒绝。
4. 用管理员核对失败队列/应用可用范围；网页会显示最近投递状态。真实审批与票据下载仍按原权限执行。
5. 有问题时优先关闭 `FEISHU_NOTIFY_ENABLED` 并正常重启环境，站内信继续保留。不要删除业务通知或BI数据。

本地自动验证：隔离备份副本迁移、旧表逐值SHA256、迁移中途故障回滚、mock消息/授权接口、重复投递/并发领取/重试/租约/移交/解绑测试。测试不会发送真实飞书消息，不能替代上述真实企业验收。
