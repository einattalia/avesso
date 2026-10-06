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
