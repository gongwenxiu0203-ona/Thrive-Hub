// Run against an isolated local `next start -p 3002` with the same TEST JWT/env.
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createSessionToken } from '../src/lib/auth';
const db=new PrismaClient();
async function main() {
  assert.match(process.env.DATABASE_URL||'',/backups\/feishu-notify-[^/]+\/engine\.db$/);
  assert.equal(process.env.JWT_SECRET,'feishu-http-local-test-only-32bytes-not-production');
  const base='http://127.0.0.1:3002';
  // NEXT_PUBLIC variables are frozen by Next at build time; use that build's canonical fixture origin.
  const origin=process.env.FEISHU_HTTP_EXPECTED_ORIGIN || 'https://thraivehub.com';
  const user=await db.user.findFirstOrThrow({where:{role:{in:['ADMIN','USER']},status:'APPROVED'}});
  const cookie='ams_session='+await createSessionToken({userId:user.id,name:user.name,email:user.email,role:user.role,status:user.status});
  const headers={cookie,origin};
  assert.equal((await fetch(base+'/api/settings/feishu')).status,401);
  let response=await fetch(base+'/api/settings/feishu',{headers});
  assert.equal(response.status,200);
  const status=await response.json();assert.equal(status.configured,true);assert.equal(status.binding,null);
  assert.ok(!JSON.stringify(status).includes('test-secret'));
  assert.equal((await fetch(base+'/api/settings/feishu/start',{method:'POST',headers:{...headers,origin:'https://evil.test'}})).status,403);
  response=await fetch(base+'/api/settings/feishu/start',{method:'POST',headers});
  assert.equal(response.status,200);
  const auth=await response.json();const url=new URL(auth.url);
  assert.equal(url.origin,'https://accounts.feishu.cn');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('redirect_uri'),origin+'/api/settings/feishu/callback');
  const oauthCookie=response.headers.get('set-cookie')?.split(';')[0];assert.ok(oauthCookie);
  assert.match(response.headers.get('set-cookie')||'',/HttpOnly/i);
  response=await fetch(base+'/api/settings/feishu/callback?code=FAKE&state=INVALID',{headers:{cookie:cookie+'; '+oauthCookie},redirect:'manual'});
  assert.equal(response.status,307);assert.equal(response.headers.get('location'),origin+'/settings?feishu=error');
  assert.equal((await fetch(base+'/api/settings/feishu/test',{method:'POST',headers})).status,400);
  assert.equal((await fetch(base+'/api/cron/feishu-notifications',{method:'POST'})).status,401);
  response=await fetch(base+'/api/cron/feishu-notifications',{method:'POST',headers:{authorization:'Bearer '+process.env.FEISHU_NOTIFY_CRON_SECRET}});
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.sent,0);assert.equal(result.queued,0);
  const external=await db.user.findFirst({where:{role:{in:['BRAND','CHANNEL']},status:'APPROVED'}});
  if(external) {
    const externalToken=await createSessionToken({userId:external.id,name:external.name,email:external.email,role:external.role,status:external.status});
    assert.equal((await fetch(base+'/api/settings/feishu',{headers:{cookie:'ams_session='+externalToken}})).status,403);
  }
  assert.equal((await fetch(base+'/settings',{headers})).status,200);
  console.log('Local production HTTP tests passed: session/role/origin, OAuth URL/PKCE/cookie/rejected callback, cron middleware+secret and settings SSR; no real messages or binding writes.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.$disconnect());
