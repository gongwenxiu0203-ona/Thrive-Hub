// Read-only credential check: obtains a token, queries the app's tenant, sends NO messages.
const fs=require('node:fs');
const path=require('node:path');
async function main() {
  const file=path.resolve(__dirname,'../.env.feishu-notify.local');
  const text=fs.readFileSync(file,'utf8');
  function setting(name) {
    const match=text.match(new RegExp('^'+name+'\\s*=\\s*(.*?)\\s*$','m'));
    return (match?.[1] || '').replace(/^(["'])(.*)\1$/,'$2').trim();
  }
  const id=setting('FEISHU_NOTIFY_APP_ID'),secret=setting('FEISHU_NOTIFY_APP_SECRET');
  if(!id||!secret) throw Error('请先在 .env.feishu-notify.local 填写 App ID 和 App Secret；不要把 Secret 发到聊天中。');
  async function request(url,init) {
    let res;
    try {res=await fetch('https://open.feishu.cn/open-apis'+url,{...init,signal:AbortSignal.timeout(15000)});}
    catch {throw Error('飞书连接失败或超时。');}
    let data;try {data=await res.json();} catch {throw Error('飞书响应格式异常。');}
    if(!res.ok||data.code!==0) {
      // Allow-list permission names only; never print the raw response or headers.
      const scopes=(Array.isArray(data.error?.permission_violations)?data.error.permission_violations:[])
        .map(v=>v?.subject).filter(v=>typeof v==='string'&&/^[a-z][a-z0-9_.:]{1,100}$/.test(v));
      const stage=url.includes('tenant/query')?'企业信息查询':'应用凭证校验';
      throw Error(stage+'失败，错误代码：'+(typeof data.code==='number'?data.code:res.status)+(scopes.length?'；所需权限：'+[...new Set(scopes)].join('、'):'')+'。请检查应用发布及权限。');
    }
    return data;
  }
  const token=await request('/auth/v3/tenant_access_token/internal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app_id:id,app_secret:secret})});
  if(!token.tenant_access_token) throw Error('飞书未返回应用凭证。');
  console.log('应用凭证校验通过；正在只读查询企业标识（不发送消息）。');
  const info=await request('/tenant/v2/tenant/query',{headers:{Authorization:'Bearer '+token.tenant_access_token}});
  const tenant=info.data?.tenant;
  if(!tenant?.tenant_key) throw Error('未返回 tenant_key。请在飞书 API 调试台用此应用获取企业信息。');
  console.log(JSON.stringify({appId:id,tenantKey:tenant.tenant_key,tenantName:tenant.name || '',messagesSent:0}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
