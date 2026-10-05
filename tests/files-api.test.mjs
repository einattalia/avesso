import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

// Load the actual route and authorization code, replacing only external services.
async function fixture({member=true,client=false,token=true,parts,object,completed=false,legacy=false,rpcError=false}={}) {
  const calls=[];
  const s={id:'session',user_id:'user',demand_id:'demand',object_key:'trusted/key',bucket:'bucket',upload_id:'multipart',file_name:'v.mp4',file_size:7,mime_type:'video/mp4',fingerprint:'a'.repeat(64),part_size:64*1024*1024,state:completed?'completed':'pending',version_number:completed?1:null,expires_at:new Date(Date.now()+86400000).toISOString()};
  const versions=[{id:'version',demand_id:'demand',storage_path:'trusted/key',storage_provider:legacy?'supabase':'r2',status:client?'draft':'sent_for_review'}];
  const tables={demands:[{id:'demand',client_id:'client',organization_id:'org'}],organization_members:member?[{user_id:'user',organization_id:'org',is_active:true,role:client?'client_user':'admin'}]:[],client_users:client?[{user_id:'user',client_id:'client'}]:[],r2_upload_sessions:[s],demand_versions:versions};
  function query(table) {
    let rows=tables[table]||[];let countMode=false;
    const q={select(_columns,options){countMode=!!options?.count;return q;},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},gt(k,v){rows=rows.filter(r=>r[k]>v);return q;},maybeSingle(){return Promise.resolve({data:rows[0]||null,error:null});},insert(row){tables[table].push(row);return Promise.resolve({error:null});},update(values){rows.forEach(r=>Object.assign(r,values));return Promise.resolve({error:null});},then(resolve){resolve({data:rows,error:null,count:countMode?rows.length:null});}};return q;
  }
  const db={from:query,auth:{getUser:async supplied=>({data:{user:token&&supplied==='valid'?{id:'user'}:null},error:token?null:{}})},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://legacy.test/file'}})})},rpc:async()=>{calls.push('rpc');if(rpcError)return {error:{code:'DB_FAIL'}};s.state='completed';s.version_number=1;return {data:1};}};
  const commandNames=['AbortMultipartUploadCommand','CompleteMultipartUploadCommand','CreateMultipartUploadCommand','GetObjectCommand','HeadObjectCommand','ListPartsCommand','UploadPartCommand'];
  const aws=Object.fromEntries(commandNames.map(name=>[name,class {constructor(input){this.name=name;this.input=input;}}]));
  let currentObject=object;
  aws.S3Client=class {async send(command){calls.push(command);switch(command.name){case 'CreateMultipartUploadCommand':return {UploadId:'new-upload'};case 'ListPartsCommand':return {Parts:parts||[{PartNumber:1,ETag:'tag',Size:7}]};case 'HeadObjectCommand':if(currentObject)return currentObject;throw {$metadata:{httpStatusCode:404}};case 'CompleteMultipartUploadCommand':currentObject={ContentLength:7,ContentType:'video/mp4'};return {};default:return {};}}};
  const context=vm.createContext({Request,Response,console:{error(){}},process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://supabase.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'secret',R2_ACCOUNT_ID:'account',R2_ACCESS_KEY_ID:'access',R2_SECRET_ACCESS_KEY:'secret',R2_BUCKET_NAME:'bucket'}},Date});
  const cached=new Map();
  async function synthetic(name,exports) {
    if(cached.has(name))return cached.get(name);
    const m=new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v);},{context});cached.set(name,m);return m;
  }
  async function load(name) {
    if(cached.has(name))return cached.get(name);
    if(name==='server-only')return synthetic(name,{});
    if(name==='node:crypto')return synthetic(name,{randomUUID});
    if(name==='@supabase/supabase-js')return synthetic(name,{createClient:()=>db});
    if(name==='@aws-sdk/client-s3')return synthetic(name,aws);
    if(name==='@aws-sdk/s3-request-presigner')return synthetic(name,{getSignedUrl:async(_client,command)=>{calls.push(command);return `https://r2.test/${command.input.Key}`;}});
    const path=name.includes('upload-policy')?'lib/upload-policy.mjs':name.includes('r2-server')?'lib/r2-server.js':'app/api/files/route.js';
    const m=new vm.SourceTextModule(await readFile(new URL('../'+path,import.meta.url),'utf8'),{context,identifier:name});cached.set(name,m);await m.link(load);return m;
  }
  const route=await load('route');await route.evaluate();
  return {s,calls,tables,request:async body=>{
    const r=await route.namespace.POST(new Request('https://avesso.test/api/files',{method:'POST',headers:{authorization:'Bearer valid'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};
  }};
}
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
