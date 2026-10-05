import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

async function clientFixture({failOnce=false,pause=false}={}) {
  const memory=new Map(),calls=[],parts=new Map();let attempts=0,fail=failOnce;
  const context=vm.createContext({Blob,crypto:webcrypto,AbortController,Map,JSON,Array,Math,Uint8Array,Error,Promise,console,
    setTimeout:fn=>setTimeout(fn,0),localStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
    fetch:async(_url,options)=>{
      const b=JSON.parse(options.body);calls.push(b);
      if(b.action==='init')return Response.json({id:'upload',partSize:50});
      if(b.action==='resume')return Response.json({id:'upload',partSize:50,parts:[...parts].map(([n,size])=>({PartNumber:n,Size:size}))});
      if(b.action==='part')return Response.json({url:`https://r2.test/${b.partNumber}`});
      if(b.action==='complete')return Response.json({completed:true,versionNumber:2});
      throw new Error('Unexpected action');
    },XMLHttpRequest:class {
      upload={};open(_method,url){this.url=url;}abort(){this.onabort?.();}
      send(blob){attempts++;setTimeout(()=>{if(pause){this.onerror();return;}if(fail){fail=false;this.onerror();return;}this.upload.onprogress({loaded:blob.size});parts.set(Number(this.url.split('/').at(-1)),blob.size);this.status=200;this.onload();},0);}
    }
  });
  const mod=new vm.SourceTextModule(await readFile(new URL('../lib/r2-client.js',import.meta.url),'utf8'),{context});await mod.link(()=>{});await mod.evaluate();
  const supabase={auth:{getSession:async()=>({data:{session:{access_token:'token'}}}),getUser:async()=>({data:{user:{id:'user'}}})}};
  return {module:mod.namespace,supabase,calls,memory,parts,get attempts(){return attempts;}};
}
const file=()=>new File(['a'.repeat(100)],'video.mp4',{type:'video/mp4',lastModified:100});
test('browser sends directly to signed URLs and retries failed parts',async()=>{
  const f=await clientFixture({failOnce:true});const progress=[];
  const result=await f.module.uploadProduction(f.supabase,'demand',file(),n=>progress.push(n));
  assert.equal(result.versionNumber,2);assert.equal(f.attempts,3);assert.equal(progress.at(-1),100);assert.equal(f.memory.size,0);
  assert.ok(f.calls.every(b=>!Object.hasOwn(b,'bytes')));
});
test('reselection resumes stored upload and skips already completed parts',async()=>{
  const f=await clientFixture({pause:true});
  await assert.rejects(()=>f.module.uploadProduction(f.supabase,'demand',file(),()=>{}));assert.equal(f.memory.size,1);
  const fp=f.calls.find(c=>c.action==='init').file.fingerprint;
  const recovered=await clientFixture();const key=`avesso-r2:user:demand:${fp}`;recovered.memory.set(key,JSON.stringify({id:'upload'}));recovered.parts.set(1,50);
  await recovered.module.uploadProduction(recovered.supabase,'demand',file(),()=>{});
  assert.equal(recovered.attempts,1);assert.ok(recovered.calls.some(c=>c.action==='resume'));assert.ok(!recovered.calls.some(c=>c.action==='init'));assert.equal(recovered.memory.size,0);
});
