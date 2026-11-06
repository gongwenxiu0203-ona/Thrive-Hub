// Use from cron with flock; secret stays in the server .env, never in command arguments/URL.
const path=require('node:path');
process.env.NODE_ENV='production';
require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'));
async function main() {
  if(process.env.FEISHU_NOTIFY_ENABLED!=='true') return;
  const secret=process.env.FEISHU_NOTIFY_CRON_SECRET?.trim();
  if(!secret||secret.length<32) throw Error('飞书通知任务未配置安全密钥。');
  const res=await fetch('http://127.0.0.1:3000/api/cron/feishu-notifications',{method:'POST',headers:{Authorization:'Bearer '+secret},signal:AbortSignal.timeout(55000)});
  if(!res.ok) throw Error('飞书通知任务 HTTP '+res.status+'，请检查网站及推送配置。');
  const data=await res.json();
  // Do not log request headers, provider responses or message content.
  if(data.sent||data.failed||data.cancelled) console.log(new Date().toISOString(),JSON.stringify({sent:data.sent,failed:data.failed,cancelled:data.cancelled}));
}
main().catch(()=>{console.error(new Date().toISOString(),'飞书通知任务失败，请检查服务和配置。');process.exitCode=1;});
