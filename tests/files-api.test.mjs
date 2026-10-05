import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/api-fixture.mjs';

test('unauthenticated request rejected before any R2 operation',async()=>{
  const f=await fixture({token:false});assert.equal((await f.request({action:'init'})).status,401);assert.equal(f.calls.length,0);
});
test('cross-organization upload and reads denied',async()=>{
  const f=await fixture({member:false});assert.equal((await f.request({action:'part',id:'session',partNumber:1})).status,403);assert.equal((await f.request({action:'read',versionId:'version'})).status,403);assert.equal(f.calls.length,0);
});
test('client can neither upload nor read agency drafts',async()=>{
  const f=await fixture({client:true});assert.equal((await f.request({action:'part',id:'session',partNumber:1})).status,403);assert.equal((await f.request({action:'read',versionId:'version'})).status,403);
});
test('published client read signs only trusted completed object',async()=>{
  const f=await fixture({client:true,completed:true});f.tables.demand_versions[0].status='sent_for_review';
  const result=await f.request({action:'read',versionId:'version',key:'attacker/key'});assert.equal(result.status,200);assert.equal(result.body.url,'https://r2.test/trusted/key');
});
test('part number bounds and ownership prevent arbitrary signatures',async()=>{
  const f=await fixture();for(const n of [0,2,1.5])assert.equal((await f.request({action:'part',id:'session',partNumber:n})).status,400);
  assert.equal((await f.request({action:'part',id:'other-user-session',partNumber:1})).status,404);
  assert.equal((await f.request({action:'part',id:'session',partNumber:1,key:'attacker/key'})).body.url,'https://r2.test/trusted/key');
});
test('complete validates R2 parts before committing metadata',async()=>{
  const f=await fixture({parts:[{PartNumber:1,ETag:'tag',Size:6}]});assert.equal((await f.request({action:'complete',id:'session'})).status,400);assert.ok(!f.calls.includes('rpc'));
});
test('successful completion and retry create only one version',async()=>{
  const f=await fixture();assert.equal((await f.request({action:'complete',id:'session'})).body.versionNumber,1);assert.equal((await f.request({action:'complete',id:'session'})).body.versionNumber,1);assert.equal(f.calls.filter(c=>c==='rpc').length,1);
});
test('recover object completed before lost database response without reuploading',async()=>{
  const f=await fixture({object:{ContentLength:7,ContentType:'video/mp4'}});assert.equal((await f.request({action:'complete',id:'session'})).status,200);assert.ok(!f.calls.some(c=>c.name==='CompleteMultipartUploadCommand'));
});
test('incorrect object size and database failure never expose unfinished object',async()=>{
  const bad=await fixture({object:{ContentLength:8,ContentType:'video/mp4'}});assert.equal((await bad.request({action:'complete',id:'session'})).status,409);
  const f=await fixture({rpcError:true});assert.equal((await f.request({action:'complete',id:'session'})).status,500);assert.equal((await f.request({action:'read',versionId:'version'})).status,404);
});
test('legacy versions keep Supabase signed URLs',async()=>{
  const f=await fixture({legacy:true});assert.equal((await f.request({action:'read',versionId:'version'})).body.url,'https://legacy.test/file');
});
test('resume verifies file identity and returns completed parts',async()=>{
  const f=await fixture();assert.equal((await f.request({action:'resume',id:'session',fingerprint:'wrong'})).status,409);assert.equal((await f.request({action:'resume',id:'session',fingerprint:'a'.repeat(64)})).body.parts.length,1);
});
