// Run with flock from cron. The scanner itself enforces Shanghai fifth-day 09:00.
const path=require('node:path');
process.env.NODE_ENV='production';
require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'));
async function main(){
  const secret=process.env.CONTRACT_AM_CRON_SECRET?.trim();
  if(!secret||secret.length<32)throw Error('AM cron secret missing');
  const response=await fetch('http://127.0.0.1:3000/api/cron/contract-am-reminders',{method:'POST',headers:{Authorization:'Bearer '+secret},signal:AbortSignal.timeout(55000)});
  if(!response.ok)throw Error('AM cron HTTP '+response.status);
  const data=await response.json();
  if(data.created)console.log(new Date().toISOString(),JSON.stringify({created:data.created,skipped:data.skipped}));
}
main().catch(()=>{console.error(new Date().toISOString(),'AM提醒任务失败，请检查服务及配置。');process.exitCode=1;});
