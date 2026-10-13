import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as policy from '../lib/production-policy.mjs';
async function fixture({responseStatus=200,body={messages:[{id:'wamid.test'}]},network=false,enabled=true}={}){
  let job={id:'job',lease_id:'lease',demand_id:'demand',phone:'11999999999',title:'Criativo'};const calls=[],results=[];
  const admin={rpc:async(name,args)=>{if(name==='avesso_claim_approval_notification'){const current=job;job=null;return {data:current};}results.push(args);return {error:null};}};
  const context=vm.createContext({process:{env:{WHATSAPP_ENABLED:enabled?'true':'false',WHATSAPP_ACCESS_TOKEN:'test-token',WHATSAPP_PHONE_NUMBER_ID:'1234',WHATSAPP_TEMPLATE_NAME:'avesso_aprovacao',WHATSAPP_API_VERSION:'v99.0',APP_URL:'https://example.com/'}},AbortSignal,fetch:async(url,options)=>{calls.push({url,options});if(network)throw new Error('Network failure');return Response.json(body,{status:responseStatus});}});
  const module=new vm.SourceTextModule(await readFile(new URL('../lib/whatsapp-server.js',import.meta.url),'utf8'),{context});
  await module.link(async name=>{const exports=name==='server-only'?{}:policy;return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports))this.setExport(key,value)},{context})});await module.evaluate();
  return {send:()=>module.namespace.dispatchApproval(admin,'demand'),calls,results};
}
test('configured WhatsApp sends the approved template once and records acceptance',async()=>{
  const f=await fixture();assert.equal((await f.send()).state,'accepted');assert.equal((await f.send()).state,'idle');assert.equal(f.calls.length,1);
  const sent=JSON.parse(f.calls[0].options.body);assert.equal(sent.type,'template');assert.equal(sent.to,'5511999999999');assert.equal(f.results[0].result_message_id,'wamid.test');
});
test('WhatsApp config disabled does not claim or send messages',async()=>{
  const f=await fixture({enabled:false});assert.equal((await f.send()).state,'not_configured');assert.equal(f.calls.length,0);assert.equal(f.results.length,0);
});
test('provider rejection and network ambiguity have different outcomes',async()=>{
  const refused=await fixture({responseStatus:400,body:{error:{code:132001}}});assert.equal((await refused.send()).state,'failed');assert.equal(refused.results[0].result_code,'132001');
  const uncertain=await fixture({network:true});assert.equal((await uncertain.send()).state,'uncertain');assert.equal((await uncertain.send()).state,'idle');assert.equal(uncertain.calls.length,1);
});
