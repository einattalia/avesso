import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/api-fixture.mjs';
import {normalizeContractItems,isArtService} from '../lib/contract-items.mjs';
test('contract text is saved independently and loaded again',async()=>{
  const f=await fixture();
  const result=await f.request({scope:'contract',action:'saveText',contractId:'contract',content:'Cláusula 1\nCondições de pagamento.'});
  assert.equal(result.status,200);
  const reload=await f.request({scope:'contract',action:'list',contractId:'contract'});
  assert.equal(reload.body.content,'Cláusula 1\nCondições de pagamento.');assert.equal(reload.body.files.length,1);
});
test('contract documents reject clients and outsiders before reading or saving',async()=>{
  for(const options of [{client:true},{member:false}]){
    const f=await fixture(options);
    for(const action of ['list','saveText','read'])assert.equal((await f.request({scope:'contract',action,contractId:'contract',fileId:'session',content:'forbidden'})).status,403);
    assert.equal(f.tables.contract_documents[0].content,'Original');
  }
});
test('contract attachments only sign completed objects tied to that contract',async()=>{
  const f=await fixture({completed:true});
  assert.equal((await f.request({scope:'contract',action:'read',contractId:'contract',fileId:'session',key:'foreign/key'})).body.url,'https://r2.test/contracts/trusted/key');
  f.tables.contract_files[0].contract_id='other-contract';
  assert.equal((await f.request({scope:'contract',action:'read',contractId:'contract',fileId:'session'})).status,404);
});
test('contract text and attachment sizes/types are validated on the server',async()=>{
  const f=await fixture();
  assert.equal((await f.request({scope:'contract',action:'saveText',contractId:'contract',content:'x'.repeat(100001)})).status,400);
  for(const bad of [{type:'video/mp4',size:7},{type:'application/pdf',size:104857601}]){
    assert.equal((await f.request({scope:'contract',action:'init',contractId:'contract',file:{name:'contract.pdf',fingerprint:'a'.repeat(64),...bad}})).status,400);
  }
});
test('contract multipart completion does not create demand versions',async()=>{
  const f=await fixture();const result=await f.request({scope:'contract',action:'complete',id:'session'});
  assert.equal(result.status,200);assert.equal(result.body.fileId,'session');assert.equal(f.s.state,'pending');
  assert.equal((await f.request({scope:'contract',action:'complete',id:'session'})).body.fileId,'session');
  assert.equal(f.calls.filter(c=>c==='rpc').length,1);
});
test('designer and videomaker roster is scoped to the agency',async()=>{
  const f=await fixture({routeName:'team'});const result=await f.request({action:'list',organizationId:'org'});
  assert.equal(result.status,200);assert.deepEqual(result.body.team.map(m=>m.role),['designer','videomaker']);
  assert.equal((await f.request({action:'list',organizationId:'other'})).status,403);
});
test('team registration validates role and persists the person',async()=>{
  const f=await fixture({routeName:'team'});
  assert.equal((await f.request({action:'create',organizationId:'org',name:'Nova pessoa',role:'admin'})).status,400);
  assert.equal((await f.request({action:'create',organizationId:'org',name:'Nova pessoa',role:'designer'})).status,200);
  assert.equal(f.tables.agency_team_members.at(-1).name,'Nova pessoa');
});
test('assigning multiple people saves and rejects foreign people or items',async()=>{
  const f=await fixture({routeName:'team'});
  assert.equal((await f.request({action:'assign',contractId:'contract',itemIds:['art1','art2'],memberIds:['designer','videomaker']})).status,200);
  assert.equal(f.tables.contract_item_assignments.length,2);
  assert.equal((await f.request({action:'assign',contractId:'contract',itemIds:['art1'],memberIds:['foreign']})).status,403);
  assert.equal((await f.request({action:'assign',contractId:'contract',itemIds:['foreign-item'],memberIds:['designer']})).status,403);
});
test('agency membership is required to manage the team or responsibilities',async()=>{
  const f=await fixture({routeName:'team',client:true});
  assert.equal((await f.request({action:'list',organizationId:'org'})).status,403);
  assert.equal((await f.request({action:'assign',contractId:'contract',itemIds:['art1'],memberIds:['designer']})).status,403);
});
test('unification sums active static and carousel quotas into one editable Artes row',()=>{
  const rows=normalizeContractItems([
    {id:'a',name:'Estáticos',monthly_quantity:4,extra_value:20,is_active:true},
    {id:'b',name:'Carrosséis',monthly_quantity:2,extra_value:20,is_active:true},
    {id:'c',name:'Arte estática',monthly_quantity:50,is_active:false},
    {id:'d',name:'Vídeos',monthly_quantity:3,is_active:true}
  ]);
  assert.equal(rows.length,2);assert.equal(rows[0].name,'Artes');assert.equal(rows[0].monthly_quantity,6);assert.equal(rows[0].extra_value,20);assert.equal(rows[1].name,'Vídeos');
});
test('unification skips archived rows, preserves undefined quotas and flags differing prices as undefined',()=>{
  const rows=normalizeContractItems([{id:'a',name:'Artes',monthly_quantity:null,extra_value:20,is_active:true},{id:'b',name:'Carrosséis',monthly_quantity:null,extra_value:40,is_active:true},{id:'c',name:'Estáticos',monthly_quantity:100,is_active:false,merged_into:'a'}]);
  assert.equal(rows.length,1);assert.equal(rows[0].monthly_quantity,null);assert.equal(rows[0].extra_value,null);assert.equal(rows[0]._sourceIds.length,2);
  assert.equal(isArtService('Material bruto'),false);assert.equal(isArtService('Design'),true);
});
test('merge validation prevents stale rows and fractional quotas',async()=>{
  const f=await fixture({routeName:'team'});
  assert.equal((await f.request({action:'mergeArts',contractId:'contract',itemId:'art1',quantity:6,extraValue:20,active:true})).status,200);
  assert.equal((await f.request({action:'mergeArts',contractId:'contract',itemId:'foreign',quantity:6,extraValue:20,active:true})).status,409);
  assert.equal((await f.request({action:'mergeArts',contractId:'contract',itemId:'art1',quantity:1.5,extraValue:20,active:true})).status,400);
});

test('adding another service preserves sources and price warning of grouped arts',()=>{
  const initial=normalizeContractItems([{id:'a',name:'Estáticos',monthly_quantity:4,extra_value:10,is_active:true},{id:'b',name:'Carrosséis',monthly_quantity:2,extra_value:20,is_active:true}]);
  const added=normalizeContractItems([...initial,{id:'v',name:'Vídeos',monthly_quantity:3,is_active:true}]);
  assert.deepEqual(added[0]._sourceIds,['a','b']);assert.equal(added[0].monthly_quantity,6);assert.equal(added[0]._priceConflict,true);
});
