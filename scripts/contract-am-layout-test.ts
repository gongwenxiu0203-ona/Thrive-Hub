import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import {randomUUID} from 'node:crypto';

async function main(){
  const page=fs.readFileSync('src/app/(app)/contracts/page.tsx','utf8');
  assert.ok(page.indexOf('新建合同</Link>')<page.indexOf('<ContractAMBulkActions'));
  assert.match(page,/结束时间<\/th>[\s\S]*?>AM<\/th>[\s\S]*?>负责人<\/th>/);
  assert.equal((page.match(/<ContractAMCheckbox id=/g)||[]).length,3,'All three lists need row checkboxes');
  assert.ok(!page.includes('<ContractAMEditor'),'No duplicate standalone contract picker');
  const panel=fs.readFileSync('src/components/contracts/ContractAMPanel.tsx','utf8');
  for(const value of ['assignedBy','createdAt','text-slate-500','设置时间','操作账号'])assert.ok(panel.includes(value));
  const editor=fs.readFileSync('src/components/contracts/ContractAMEditor.tsx','utf8');
  for(const value of ['搜索 AM 账号','<details','type="checkbox"','router.refresh()'])assert.ok(editor.includes(value));
  assert.ok(!editor.includes('{bulk&&<label'),'Detail and bulk must both expose assignment mode');
  for(const mode of ['APPEND','REPLACE','CLEAR'])assert.ok(editor.includes(`value="${mode}"`));
  assert.ok(editor.includes('amIds,mode)'),'Submit the explicitly selected mode, not implicit clear');
  const dir=path.resolve('backups/finance-am-workflow-20261112-01');
  const file=path.join(dir,`am-layout-${randomUUID()}.db`);
  assert.equal(path.dirname(file),dir);assert.ok(!fs.existsSync(file));
  fs.copyFileSync(path.join(dir,'engine.db'),file,fs.constants.COPYFILE_EXCL);
  process.env.DATABASE_URL='file:'+file.replaceAll('\\','/');process.env.FEISHU_NOTIFY_ENABLED='false';
  let actorId='';const refreshed:string[]=[];
  const loader=Module as unknown as {_load:(name:string,...args:unknown[])=>unknown};const original=loader._load;
  loader._load=function(name,...args){
    if(name==='next/cache')return {revalidatePath:(value:string)=>refreshed.push(value)};
    if(name==='@/lib/session')return {requireSession:async()=>({userId:actorId,role:'ADMIN'})};
    if(name==='@/lib/permissionGuard')return {requireFeaturePermission:async()=> 'MANAGE'};
    return original.call(this,name,...args);
  };
  const {prisma:db}=await import('../src/lib/prisma');
  try{
    const {assignContractAM}=await import('../src/actions/contractAM');const tag=randomUUID();
    const actor=await db.user.create({data:{name:'Fixture setter',email:`setter-${tag}@example.invalid`,passwordHash:'not-login',role:'ADMIN'}});actorId=actor.id;
    const users=await Promise.all([1,2].map(n=>db.user.create({data:{name:`Fixture AM ${n}`,email:`am${n}-${tag}@example.invalid`,passwordHash:'not-login'}})));
    const contracts=await Promise.all([1,2].map(n=>db.contract.create({data:{contractNo:`AM-LAYOUT-${n}-${tag}`,type:'BRAND',createdById:actor.id}})));
    assert.equal((await assignContractAM(contracts.map(c=>c.id),users.map(u=>u.id),'REPLACE')).ok,true);
    for(const contract of contracts){
      const rows=await db.contractAMAssignment.findMany({where:{contractId:contract.id},include:{assignedBy:true,user:true}});
      assert.equal(rows.length,2);assert.ok(rows.every(row=>row.assignedById===actor.id&&row.createdAt instanceof Date));
      assert.ok(refreshed.includes(`/contracts/${contract.id}`));
    }
    assert.ok(refreshed.includes('/contracts'));
    assert.equal((await assignContractAM([contracts[0].id],[users[1].id],'REPLACE')).ok,true);
    assert.equal(await db.contractAMAssignment.count({where:{contractId:contracts[0].id}}),1);
    assert.equal(await db.contractAMAssignment.count({where:{contractId:contracts[1].id}}),2);
    assert.equal((await assignContractAM([contracts[0].id],[users[1].id],'APPEND')).ok,true);
    assert.equal(await db.contractAMAssignment.count({where:{contractId:contracts[0].id}}),1);
    assert.equal((await assignContractAM([contracts[0].id],[],'CLEAR')).ok,true);
    assert.equal(await db.contractAMAssignment.count({where:{contractId:contracts[0].id}}),0);
    console.log('PASS: layout structure, batch/detail shared persistence, setter/time, refresh, replace/append/clear; fictional isolated DB only. Browser appearance not tested.');
  }finally{loader._load=original;await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
