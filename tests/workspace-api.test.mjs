import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/api-fixture.mjs';

test('reference can be saved using only text, with title derived from text',async()=>{
 const f=await fixture({routeName:'workspace'});
 const r=await f.request({action:'save',clientId:'client',section:'references',body:'Uma ideia sem anexos',shared:false});
 assert.equal(r.status,200);assert.equal(r.body.item.title,'Uma ideia sem anexos');assert.equal(r.body.item.link,'');assert.equal(f.tables.client_materials.length,1);
});
test('client references are shared; internal agency references stay hidden',async()=>{
 const f=await fixture({routeName:'workspace',client:true});
 f.tables.client_materials.push({id:'private',client_id:'client',section:'references',shared:false,title:'Interna',author_id:'agency'});
 assert.equal((await f.request({action:'list',clientId:'client',section:'references'})).body.items.length,0);
 assert.equal((await f.request({action:'thread',clientId:'client',subjectType:'material',subjectId:'private'})).status,404);
 const r=await f.request({action:'save',clientId:'client',section:'references',body:'Ideia do cliente',shared:false});
 assert.equal(r.status,200);assert.equal(r.body.item.shared,true);
});
test('foreign client, unauthenticated requests and client branding edits are rejected',async()=>{
 const f=await fixture({routeName:'workspace',client:true});
 assert.equal((await f.request({action:'list',clientId:'foreign-client',section:'references'})).status,403);
 assert.equal((await f.request({action:'save',clientId:'client',section:'branding',body:'Mudar marca'})).status,403);
 const anon=await fixture({routeName:'workspace',token:false});
 assert.equal((await anon.request({action:'list',clientId:'client',section:'references'})).status,401);
});
test('client cannot reserve time or edit another author reference',async()=>{
 const f=await fixture({routeName:'workspace',client:true});
 f.tables.client_materials.push({id:'ref',client_id:'client',section:'references',shared:true,author_id:'other',updated_at:'now'});
 assert.equal((await f.request({action:'saveEvent',clientId:'client',event:{}})).status,403);
 assert.equal((await f.request({action:'save',clientId:'client',section:'references',id:'ref',body:'Alterado',updatedAt:'now'})).status,403);
});
test('calendar reports actual time conflicts as 409 with the conflicting slot',async()=>{
 const f=await fixture({routeName:'workspace',rpcError:{code:'P0001',message:'Conflito: Reunião em 07/10 09:00 até 07/10 10:00.'}});
 const r=await f.request({action:'saveEvent',organizationId:'org',event:{title:'Gravação',kind:'recording',starts_at:'2026-10-07T12:00:00.000Z',ends_at:'2026-10-07T13:00:00.000Z',member_ids:[],buffer_before:0,buffer_after:0,shared:true}});
 assert.equal(r.status,409);assert.match(r.body.error,/Conflito: Reunião/);
});
test('calendar separates invalid data from database failures instead of labeling both conflicts',async()=>{
 const payload={action:'saveEvent',organizationId:'org',event:{title:'Gravação',kind:'recording',starts_at:'2026-10-07T12:00:00.000Z',ends_at:'2026-10-07T13:00:00.000Z',member_ids:[],buffer_before:0,buffer_after:0,shared:true}};
 const invalid=await fixture({routeName:'workspace',rpcError:{code:'P0001',message:'Invalid team'}});
 const db=await fixture({routeName:'workspace',rpcError:{code:'XX000',message:'Internal database error'}});
 const a=await invalid.request(payload),b=await db.request(payload);
 assert.equal(a.status,400);assert.match(a.body.error,/inválidos/);
 assert.equal(b.status,500);assert.match(b.body.error,/A agenda não foi alterada/);
});
test('stale reference edits do not overwrite changes',async()=>{
 const f=await fixture({routeName:'workspace'});f.tables.client_materials.push({id:'ref',client_id:'client',section:'references',author_id:'user',updated_at:'new',body:'Atual'});
 const r=await f.request({action:'save',clientId:'client',section:'references',id:'ref',body:'Antigo',updatedAt:'old'});
 assert.equal(r.status,409);assert.equal(f.tables.client_materials[0].body,'Atual');
});
test('draft media cannot be opened or commented on by the client',async()=>{
 const f=await fixture({routeName:'workspace',client:true});
 const r=await f.request({action:'comment',clientId:'client',subjectType:'version',subjectId:'version',body:'Comentário'});
 assert.equal(r.status,403);assert.equal(f.tables.client_notes.length,0);
});
test('approved captions cannot be silently changed and client cannot sign a slide upload',async()=>{
 const f=await fixture({routeName:'workspace'});f.tables.demand_versions[0].status='approved';
 assert.equal((await f.request({action:'caption',clientId:'client',subjectType:'version',subjectId:'version',body:'Nova legenda'})).status,409);
 const c=await fixture({routeName:'workspace',client:true});c.tables.demand_versions[0].status='sent_for_review';
 assert.equal((await c.request({action:'initAsset',clientId:'client',subjectType:'version',subjectId:'version',purpose:'slide',mime:'image/png',name:'x.png',size:10})).status,409);
});

test('contents keep client change requests attached to the exact sent artwork',async()=>{
 const f=await fixture({routeName:'workspace'});
 const sentAt='2026-10-19T15:00:00.000Z';
 f.tables.demand_versions.splice(0,f.tables.demand_versions.length,
  {id:'single-v2',demand_id:'demand',approval_option_set_id:null,version_number:2,status:'changes_requested',file_name:'single.png'},
  {id:'option-v3',demand_id:'demand',approval_option_set_id:'option-set',version_number:3,status:'changes_requested',file_name:'option-1.png'},
  {id:'option-v4',demand_id:'demand',approval_option_set_id:'option-set',version_number:4,status:'changes_requested',file_name:'option-2.png'}
 );
 f.tables.approval_events.push(
  {id:'note-single',demand_version_id:'single-v2',event:'changes_requested',note:'Ajustar o texto',created_at:sentAt},
  {id:'note-option-1',demand_version_id:'option-v3',event:'changes_requested',note:'Trocar a cor',created_at:sentAt},
  {id:'note-option-2',demand_version_id:'option-v4',event:'changes_requested',note:'Trocar a cor',created_at:sentAt}
 );
 const r=await f.request({action:'contents',clientId:'client'});
 assert.equal(r.status,200);
 const notes=r.body.items[0].reviewNotes;
 assert.equal(notes.length,2);
 const single=notes.find(item=>item.note==='Ajustar o texto');
 const options=notes.find(item=>item.note==='Trocar a cor');
 assert.deepEqual(single.versionIds,['single-v2']);
 assert.deepEqual(options.versionIds.sort(),['option-v3','option-v4']);
 assert.deepEqual(options.versionNumbers,[3,4]);
});
