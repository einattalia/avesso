import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/api-fixture.mjs';
import {brazilPhone,approvalUrl,templateMessage,productionLabel} from '../lib/production-policy.mjs';

test('briefing text and attachments remain independent of contracts and production versions',async()=>{
  const f=await fixture();
  const saved=await f.request({scope:'briefing',action:'saveText',clientId:'client',content:'Referências e orientações'});
  assert.equal(saved.status,200);assert.equal((await f.request({scope:'briefing',action:'list',clientId:'client'})).body.content,'Referências e orientações');
  assert.equal(f.tables.contract_documents[0].content,'Original');
  const result=await f.request({scope:'briefing',action:'complete',id:'session'});
  assert.equal(result.status,200);assert.equal(result.body.fileId,'session');assert.equal(f.tables.contract_upload_sessions[0].state,'pending');assert.equal(f.s.state,'pending');
});
test('briefing rejects portal users, foreign clients and videos but accepts photos',async()=>{
  const client=await fixture({client:true});assert.equal((await client.request({scope:'briefing',action:'list',clientId:'client'})).status,403);
  const f=await fixture();assert.equal((await f.request({scope:'briefing',action:'list',clientId:'foreign-client'})).status,403);
  const body={scope:'briefing',action:'init',clientId:'client',file:{name:'file',size:7,fingerprint:'a'.repeat(64),type:'video/mp4'}};
  assert.equal((await f.request(body)).status,400);
  assert.equal((await f.request({...body,file:{...body.file,type:'image/webp'}})).status,200);
});
test('production send requires agency access and does not approve on behalf of clients',async()=>{
  const agency=await fixture({routeName:'production'});
  const result=await agency.request({action:'send',demandId:'demand',versionId:'version'});
  assert.equal(result.status,200);assert.equal(result.body.status,'with_client');assert.equal(result.body.notice.state,'not_configured');
  assert.equal((await agency.request({action:'approve',demandId:'demand',versionId:'version'})).status,403);
  const client=await fixture({routeName:'production',client:true});
  assert.equal((await client.request({action:'send',demandId:'demand',versionId:'version'})).status,403);
  assert.equal((await client.request({action:'approve',demandId:'demand',versionId:'version'})).status,200);
});
test('failed production transaction never reports success or dispatches notification',async()=>{
  const f=await fixture({routeName:'production',rpcError:true});
  const result=await f.request({action:'send',demandId:'demand',versionId:'version'});
  assert.equal(result.status,409);assert.equal(result.body.notice,undefined);
});
test('approval messages normalize Brazil phones and carry a portal link without storage secrets',()=>{
  assert.equal(brazilPhone('(11) 99999-9999'),'5511999999999');assert.equal(brazilPhone('+55 11 99999-9999'),'5511999999999');assert.throws(()=>brazilPhone('123'));
  const url=approvalUrl('https://avesso-seven.vercel.app/','demand');assert.equal(url,'https://avesso-seven.vercel.app/?approval=demand');assert.throws(()=>approvalUrl('http://example.com','demand'));
  const payload=templateMessage({phone:'11999999999',title:'Criativo de outubro',demandId:'demand',template:'avesso_aprovacao'});
  assert.equal(payload.template.components[1].parameters[0].text,'demand');assert.equal(payload.template.components[0].parameters[0].text,'Criativo de outubro');assert.ok(!JSON.stringify(payload).includes('r2.cloudflarestorage'));
  assert.equal(productionLabel('with_client'),'Aguardando aprovação');assert.equal(productionLabel('posted'),'Postado');
});

test('client must describe adjustment and agency cannot submit client decision',async()=>{
 const client=await fixture({routeName:'production',client:true});
 assert.equal((await client.request({action:'changes',demandId:'demand',versionId:'version',note:'  '})).status,400);
 assert.equal((await client.request({action:'changes',demandId:'demand',versionId:'version',note:'Trocar a foto.'})).status,200);
 const agency=await fixture({routeName:'production'});
 assert.equal((await agency.request({action:'changes',demandId:'demand',versionId:'version',note:'Trocar foto'})).status,403);
});
