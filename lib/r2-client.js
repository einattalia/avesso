export async function fileApi(supabase,body,endpoint='/api/files') {
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body)});
  let data; try {data=await response.json();} catch {throw new Error('O servidor não respondeu. Tente novamente.');}
  if(!response.ok) throw Object.assign(new Error(data.error||'Falha no armazenamento.'),{status:response.status});
  return data;
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function fingerprint(file) {
  // Sample both ends to avoid reading multi-GB videos into memory.
  const sample=1024*1024;
  const bytes=await new Blob([`${file.name}:${file.size}:${file.lastModified}:${file.type}:`,file.slice(0,sample),file.slice(Math.max(0,file.size-sample))]).arrayBuffer();
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
function stored(key) {try {return JSON.parse(localStorage.getItem(key)||'null');} catch {return null;}}
function remember(key,value) {try {value?localStorage.setItem(key,JSON.stringify(value)):localStorage.removeItem(key);} catch {}}
function putPart(url,blob,onProgress,signal) {
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    const abort=()=>xhr.abort();
    const cleanup=()=>signal?.removeEventListener('abort',abort);
    xhr.open('PUT',url); xhr.timeout=10*60*1000;
    xhr.upload.onprogress=e=>onProgress(e.loaded);
    xhr.onload=()=>{cleanup();if(xhr.status>=200&&xhr.status<300)resolve();else reject(new Error('Não foi possível enviar a parte.'));};
    xhr.onerror=xhr.ontimeout=()=>{cleanup();reject(new Error('Falha de conexão durante o envio.'));};
    xhr.onabort=()=>{cleanup();reject(new Error('Envio pausado. Selecione o mesmo arquivo para retomar.'));};
    if(signal?.aborted) return reject(new Error('Envio pausado.'));
    signal?.addEventListener('abort',abort,{once:true});
    xhr.send(blob);
  });
}
export async function discardProduction(supabase,upload) {
  await fileApi(supabase,{action:'abort',id:upload.id,scope:upload.scope});
  remember(upload.key,null);
}
export async function uploadProduction(supabase,demandId,file,onProgress,signal,onSession=()=>{}) {
  return uploadFile(supabase,demandId,file,onProgress,signal,onSession,'demand');
}
export async function uploadContract(supabase,contractId,file,onProgress,signal,onSession=()=>{}) {
  const types={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
  const type=file.type||types[file.name.split('.').pop().toLowerCase()];
  if(!Object.values(types).includes(type)) throw new Error('Selecione um PDF, DOC, DOCX, JPG ou PNG.');
  if(file.size>100*1024*1024) throw new Error('O anexo deve ter no máximo 100 MB.');
  const normalized=type===file.type?file:new File([file],file.name,{type,lastModified:file.lastModified});
  return uploadFile(supabase,contractId,normalized,onProgress,signal,onSession,'contract');
}
export async function uploadBriefing(supabase,clientId,file,onProgress,signal,onSession=()=>{}) {
  const types={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
  const type=file.type||types[file.name.split('.').pop().toLowerCase()];
  if(!Object.values(types).includes(type))throw new Error('Selecione um PDF ou uma foto JPG, PNG ou WEBP.');
  if(file.size>100*1024*1024)throw new Error('O anexo deve ter no máximo 100 MB.');
  const normalized=type===file.type?file:new File([file],file.name,{type,lastModified:file.lastModified});
  return uploadFile(supabase,clientId,normalized,onProgress,signal,onSession,'briefing');
}
async function uploadFile(supabase,targetId,file,onProgress,signal,onSession,scope) {
  const request=body=>fileApi(supabase,{...body,scope});
  const fp=await fingerprint(file);
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) throw new Error('Sua sessão expirou.');
  const key=`${scope==='briefing'?'avesso-r2-briefing':scope==='contract'?'avesso-r2-contract':'avesso-r2'}:${user.id}:${targetId}:${fp}`;
  let upload=stored(key);
  if(upload) {
    try {upload=await request({action:'resume',id:upload.id,fingerprint:fp});}
    catch(e) {if([404,410].includes(e.status)) {remember(key,null);upload=null;} else throw e;}
  }
  if(!upload) {
    upload=await request({action:'init',[scope==='briefing'?'clientId':scope==='contract'?'contractId':'demandId']:targetId,file:{name:file.name,size:file.size,type:file.type,fingerprint:fp}});
    remember(key,{id:upload.id});
  }
  onSession({id:upload.id,key,scope});
  if(upload.completed) {remember(key,null);onSession(null);onProgress(100);return upload;}
  let stopped=false;
  try {
    if(!upload.uploaded) {
      const count=Math.ceil(file.size/upload.partSize);
      const sent=new Map((upload.parts||[]).filter(p=>Number(p.Size)===Math.min(upload.partSize,file.size-(p.PartNumber-1)*upload.partSize)).map(p=>[p.PartNumber,Number(p.Size)]));
      const pending=Array.from({length:count},(_,i)=>i+1).filter(n=>!sent.has(n));
      const report=()=>onProgress(Math.min(99,Math.floor([...sent.values()].reduce((a,b)=>a+b,0)/file.size*100)));
      report(); let cursor=0;
      const worker=async()=>{
        while(cursor<pending.length&&!stopped) {
          const n=pending[cursor++]; const blob=file.slice((n-1)*upload.partSize,n*upload.partSize);
          let success=false;
          for(let attempt=0;attempt<5;attempt++) {
            if(signal?.aborted) throw new Error('Envio pausado. Selecione o mesmo arquivo para retomar.');
            try {
              const {url}=await request({action:'part',id:upload.id,partNumber:n});
              await putPart(url,blob,bytes=>{sent.set(n,bytes);report();},signal);
              sent.set(n,blob.size);report();success=true;break;
            } catch(e) {
              sent.set(n,0);report();
              if(signal?.aborted||[401,403,404,410].includes(e.status)||attempt===4) {stopped=true;throw e;}
              await wait(1000*2**attempt);
            }
          }
          if(!success) throw new Error('Selecione o mesmo arquivo para retomar o envio.');
        }
      };
      const results=await Promise.allSettled(Array.from({length:Math.min(3,pending.length)},()=>worker()));
      const failure=results.find(r=>r.status==='rejected');if(failure) throw failure.reason;
    }
    if(signal?.aborted) throw new Error('Envio pausado. Selecione o mesmo arquivo para retomar.');
    // Safe to repeat after a lost response: finalization is idempotent and transactional.
    let result;
    for(let attempt=0;attempt<3;attempt++) {
      try {result=await request({action:'complete',id:upload.id});break;}
      catch(e) {if(attempt===2||e.status<500) throw e;await wait(1000*2**attempt);}
    }
    remember(key,null);onSession(null);onProgress(100);return result;
  } catch(e) {throw new Error(`${e.message} Selecione o mesmo arquivo para retomar as partes já enviadas.`);}
}
