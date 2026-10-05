import test from 'node:test';
import assert from 'node:assert/strict';
import {r2Endpoint,fileErrorDetails} from '../lib/r2-config.mjs';
import {fixture} from './helpers/api-fixture.mjs';
const id='0123456789abcdef0123456789abcdef';

test('R2 endpoint trims pasted whitespace and rejects URLs or wrong identifiers',()=>{
  assert.equal(r2Endpoint(' '+id.toUpperCase()+'\n'),`https://${id}.r2.cloudflarestorage.com`);
  for(const wrong of ['',`https://${id}.r2.cloudflarestorage.com`,'avesso-produtos','"'+id+'"',id+'1'])assert.throws(()=>r2Endpoint(wrong),e=>e.status===503&&e.message.includes('R2_ACCOUNT_ID'));
});
test('DNS diagnostics include only known hostnames and omit credentials and raw messages',()=>{
  const error={cause:{code:'ENOTFOUND',hostname:id+'.r2.cloudflarestorage.com',message:'secret token'}};
  const result=fileErrorDetails(error,'init');
  assert.equal(result.status,503);assert.equal(result.log.operation,'init');assert.equal(result.log.hostname,id+'.r2.cloudflarestorage.com');
  assert.ok(!JSON.stringify(result).includes('secret token'));
  assert.equal(fileErrorDetails({code:'ENOTFOUND',hostname:'sensitive.other.example'},'init').log.hostname,'indisponível');
  assert.match(fileErrorDetails({code:'ENOTFOUND',hostname:'a'.repeat(20)+'.supabase.co'},'authenticate').message,/Supabase/);
});
test('contract initiation reports DNS failure without recording a new session',async()=>{
  const f=await fixture({r2Error:{code:'ENOTFOUND',hostname:id+'.r2.cloudflarestorage.com'}});
  const initial=f.tables.contract_upload_sessions.length;
  const r=await f.request({scope:'contract',action:'init',contractId:'contract',file:{name:'Contrato.pdf',type:'application/pdf',size:7,fingerprint:'a'.repeat(64)}});
  assert.equal(r.status,503);assert.match(r.body.error,/DNS/);assert.match(r.body.error,/ENOTFOUND/);
  assert.equal(f.tables.contract_upload_sessions.length,initial);
});
