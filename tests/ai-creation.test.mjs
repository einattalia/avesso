import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/api-fixture.mjs';
import {creationPrompt,responseText,claudeResponseText} from '../lib/ai-creation.mjs';

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

test('connection status exposes readiness for each provider without exposing keys',async()=>{
 const f=await fixture({routeName:'ai-creation',anthropicKey:'private-anthropic'});
 const r=await f.request({action:'status',clientId:'client'});
 assert.equal(r.status,200);assert.equal(r.body.configured,true);
 assert.deepEqual(r.body.providers.map(p=>[p.id,p.configured]),[['openai',false],['anthropic',true]]);
 assert.doesNotMatch(JSON.stringify(r.body),/private-anthropic/);
});
test('Claude selection sends exactly one Messages request and never sends the OpenAI key',async()=>{
 const calls=[];const f=await fixture({routeName:'ai-creation',aiKey:'openai-secret',anthropicKey:'anthropic-secret',aiFetch:async(url,options)=>{
  calls.push({url,options});return Response.json({model:'claude-sonnet-5-5',stop_reason:'end_turn',content:[{type:'thinking',thinking:'internal'},{type:'text',text:'Roteiro para revisão'}],usage:{input_tokens:50,output_tokens:100}});
 }});
 const r=await f.request({action:'generate',clientId:'client',provider:'anthropic',tool:'script',topic:'Apresentação'});
 assert.equal(r.status,200);assert.equal(r.body.provider,'anthropic');assert.equal(r.body.text,'Roteiro para revisão');assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://api.anthropic.com/v1/messages');assert.equal(calls[0].options.headers.Authorization,'Bearer anthropic-secret');
 assert.equal(calls[0].options.headers['anthropic-version'],'2026-10-21');
 const body=JSON.parse(calls[0].options.body);assert.equal(body.max_tokens,4000);assert.equal(body.messages[0].role,'user');assert.equal(body.input,undefined);
 assert.doesNotMatch(JSON.stringify(calls),/openai-secret/);assert.doesNotMatch(JSON.stringify(r.body),/anthropic-secret|internal/);
});
test('unavailable or invalid provider never silently falls back to the other connection',async()=>{
 let calls=0;const f=await fixture({routeName:'ai-creation',aiKey:'configured',aiFetch:async()=>{calls++;throw Error('unexpected')}});
 assert.equal((await f.request({action:'generate',clientId:'client',provider:'anthropic',tool:'post',topic:'Tema'})).status,503);
 assert.equal((await f.request({action:'generate',clientId:'client',provider:'foreign',tool:'post',topic:'Tema'})).status,400);
 assert.equal(calls,0);
 const client=await fixture({routeName:'ai-creation',client:true,anthropicKey:'secret',aiFetch:async()=>{calls++;throw Error('unexpected')}});
 assert.equal((await client.request({action:'generate',clientId:'client',provider:'anthropic',tool:'post',topic:'Tema'})).status,403);assert.equal(calls,0);
});
test('Claude errors and truncation fail clearly without exposing provider response or switching providers',async()=>{
 let calls=0;const f=await fixture({routeName:'ai-creation',anthropicKey:'private',aiFetch:async()=>{calls++;return Response.json({secret:'detail'},{status:401})}});
 const r=await f.request({action:'generate',clientId:'client',provider:'anthropic',tool:'post',topic:'Tema'});
 assert.equal(r.status,502);assert.match(r.body.error,/Claude/);assert.doesNotMatch(r.body.error,/detail|private/);assert.equal(calls,1);
 assert.throws(()=>claudeResponseText({stop_reason:'max_tokens',content:[{type:'text',text:'partial'}]}),/incompleta/);
 assert.throws(()=>claudeResponseText({stop_reason:'refusal',content:[{type:'text',text:'refusal'}]}),/não concluiu/);
});
