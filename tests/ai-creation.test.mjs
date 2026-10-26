import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/api-fixture.mjs';
import {creationPrompt,responseText} from '../lib/ai-creation.mjs';

test('AI creation rejects anonymous, portal and foreign-client access before calling provider',async()=>{
 for(const opts of [{token:false},{client:true},{member:false},{}]){
  let calls=0;const f=await fixture({routeName:'ai-creation',aiKey:'private',aiFetch:async()=>{calls++;throw Error('unexpected')},...opts});
  const r=await f.request({action:'generate',clientId:Object.keys(opts).length?'client':'foreign-client',tool:'post',topic:'Tema'});
  assert.ok([401,403].includes(r.status));assert.equal(calls,0);
 }
});
test('missing API key reports inactive status and generation fails without a fabricated result',async()=>{
 const f=await fixture({routeName:'ai-creation'});
 assert.equal((await f.request({action:'status',clientId:'client'})).body.configured,false);
 const r=await f.request({action:'generate',clientId:'client',tool:'post',topic:'Tema'});
 assert.equal(r.status,503);assert.match(r.body.error,/não foi ativada/);assert.equal(r.body.text,undefined);
});
test('provider receives only authorized brand text and server-controlled settings',async()=>{
 let payload;const f=await fixture({routeName:'ai-creation',aiKey:'private',aiFetch:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(options.body);return Response.json({output:[{type:'reasoning'},{type:'message',content:[{type:'output_text',text:'Conteúdo revisável'}]}]})}});
 f.tables.client_materials.push({client_id:'client',section:'branding',title:'Marca',body:'Tom acolhedor'},{client_id:'foreign-client',section:'branding',title:'Segredo alheio',body:'Não compartilhar'});
 const r=await f.request({action:'generate',clientId:'client',tool:'carousel',topic:'Apresentação',model:'arbitrary'});
 assert.equal(r.status,200);assert.equal(r.body.text,'Conteúdo revisável');assert.match(payload.input,/Tom acolhedor/);assert.doesNotMatch(payload.input,/Segredo alheio|Não compartilhar/);assert.equal(payload.store,false);assert.equal(payload.max_output_tokens,4000);assert.notEqual(payload.model,'arbitrary');assert.doesNotMatch(JSON.stringify(r.body),/private/);
});
test('invalid and oversized requests never call provider; quota errors are actionable',async()=>{
 let calls=0;const f=await fixture({routeName:'ai-creation',aiKey:'private',aiFetch:async()=>{calls++;return Response.json({error:'secret provider detail'},{status:429})}});
 assert.equal((await f.request({action:'generate',clientId:'client',tool:'post',topic:'a'.repeat(32001)})).status,413);
 assert.equal((await f.request({action:'generate',clientId:'client',tool:'post',topic:''})).status,400);
 assert.equal(calls,0);
 const r=await f.request({action:'generate',clientId:'client',tool:'post',topic:'Tema'});assert.equal(r.status,429);assert.match(r.body.error,/saldo/);assert.doesNotMatch(r.body.error,/secret/);
});
test('prompt preserves designer role and incomplete responses are not presented as finished',()=>{
 assert.match(creationPrompt({tool:'visual',clientName:'Marca'}),/designer fará a arte final/);
 assert.throws(()=>creationPrompt({tool:'unknown'}));
 assert.throws(()=>responseText({status:'incomplete',output:[]}),/incompleta/);
 assert.throws(()=>responseText({output:[]}),/não retornou texto/);
});
