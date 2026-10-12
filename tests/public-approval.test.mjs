import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import vm from 'node:vm';

async function fixture({foreignClient=false,expired=false,revoked=false,versionStatus='sent_for_review'}={}){
  const token='c'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
  const tables={
    approval_link_tokens:[{id:'link',token_hash:hash,client_id:foreignClient?'other':'client',demand_id:'demand',demand_version_id:'version',expires_at:new Date(Date.now()+(expired?-1000:86400000)).toISOString(),revoked_at:revoked?new Date().toISOString():null,used_at:null}],
    demands:[{id:'demand',client_id:'client',title:'Campanha',status:'with_client',archived_at:null}],
    demand_versions:[{id:'version',demand_id:'demand',version_number:1,status:versionStatus,file_name:'arte.png',file_size:2048,mime_type:'image/png',storage_path:'private/key',storage_provider:'supabase',caption:'Legenda'}],
    clients:[{id:'client',name:'Cliente'}]
  };
  const calls=[];
  function query(table){let filters=[],single=false;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},order(){return q},limit(){return q},maybeSingle(){single=true;return q},then(resolve,reject){const rows=(tables[table]||[]).filter(row=>filters.every(filter=>filter(row)));return Promise.resolve({data:single?rows[0]||null:rows,error:null}).then(resolve,reject)}};return q;}
  const db={from:query,storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://signed.example/asset'}})})},rpc:async(name,args)=>{calls.push({name,args});tables.demands[0].status='approved';tables.demand_versions[0].status='approved';tables.approval_link_tokens[0].used_at=new Date().toISOString();return {data:'approved',error:null}}};
  const context=vm.createContext({Request,Response,URL,Date,console:{error(){}}});
  const module=new vm.SourceTextModule(await readFile(new URL('../app/api/public-approval/[token]/route.js',import.meta.url),'utf8'),{context});
  async function synthetic(exports){return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports))this.setExport(key,value)},{context});}
  await module.link(async name=>{
    if(name==='node:crypto')return synthetic({createHash,randomBytes});
    if(name.endsWith('r2-server'))return synthetic({adminDb:()=>db,config:()=>{throw new Error('R2 should not be used in this fixture')}});
    if(name.endsWith('upload-policy.mjs'))return synthetic({fail(message,status=400){const e=new Error(message);e.status=status;throw e}});
    if(name.endsWith('approval-token.mjs'))return new vm.SourceTextModule(await readFile(new URL('../lib/approval-token.mjs',import.meta.url),'utf8'),{context});
    if(name==='@aws-sdk/client-s3')return synthetic({GetObjectCommand:class{}});
    if(name==='@aws-sdk/s3-request-presigner')return synthetic({getSignedUrl:async()=>''});
    throw new Error(`Unexpected module: ${name}`);
  });
  await module.evaluate();
  const params={params:Promise.resolve({token})};
  return {token,calls,get:async()=>{const r=await module.namespace.GET(new Request('https://avesso.test/api'),params);return {status:r.status,body:await r.json(),headers:r.headers}},post:async()=>{const r=await module.namespace.POST(new Request('https://avesso.test/api',{method:'POST'}),params);return {status:r.status,body:await r.json()}},calls};
}

test('public approval serves only the linked client version without a login',async()=>{
  const f=await fixture();const r=await f.get();
  assert.equal(r.status,200);assert.equal(r.body.clientName,'Cliente');assert.equal(r.body.title,'Campanha');assert.equal(r.body.fileUrl,'https://signed.example/asset');
  assert.equal(r.headers.get('cache-control'),'private, no-store, max-age=0');assert.equal(r.headers.get('referrer-policy'),'no-referrer');
});

test('public approval rejects expired, revoked and cross-client links',async()=>{
  for(const options of [{expired:true},{revoked:true},{foreignClient:true}])assert.equal((await (await fixture(options)).get()).status,404);
  assert.equal((await (await fixture({versionStatus:'draft'})).get()).status,410);
});

test('approval is submitted to the server-side atomic approval function',async()=>{
  const f=await fixture();const r=await f.post();
  assert.deepEqual(r.body,{status:'approved'});assert.equal(f.calls[0].name,'avesso_approve_public_link');assert.equal(f.calls[0].args.token_digest,createHash('sha256').update(f.token).digest('hex'));
});
