import {randomUUID} from 'node:crypto';
import {AbortMultipartUploadCommand,CompleteMultipartUploadCommand,CreateMultipartUploadCommand,GetObjectCommand,HeadObjectCommand,ListPartsCommand,UploadPartCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {adminDb,authenticate,config,demandAccess,contractAccess} from '../../../lib/r2-server';
import {PART_SIZE,CONTRACT_TYPES,canReadClientVersion,fail,validateFile,validateParts} from '../../../lib/upload-policy.mjs';
import {fileErrorDetails} from '../../../lib/r2-config.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = {'Cache-Control':'private, no-store'};
async function listParts(s3,s) {
  const parts=[]; let marker;
  do {
    const r=await s3.send(new ListPartsCommand({Bucket:s.bucket,Key:s.object_key,UploadId:s.upload_id,PartNumberMarker:marker}));
    parts.push(...(r.Parts||[])); marker=r.IsTruncated?r.NextPartNumberMarker:undefined;
  } while (marker);
  return parts;
}
async function head(s3,s) {
  try {return await s3.send(new HeadObjectCommand({Bucket:s.bucket,Key:s.object_key}));}
  catch(e) {if (e.$metadata?.httpStatusCode===404) return null; throw e;}
}
export async function POST(request) {
  let operation='authenticate';
  try {
    const {db,user}=await authenticate(request);
    if (Number(request.headers.get('content-length')||0)>1048576) fail('Solicitação muito grande.',413);
    const raw=await request.text(); if(raw.length>262144) fail('Solicitação muito grande.',413);
    let b; try {b=JSON.parse(raw);} catch {fail('Solicitação inválida.');}
    if (!b || typeof b!=='object') fail('Solicitação inválida.');
    const allowed=['list','saveText','read','init','resume','part','abort','complete'];
    operation=allowed.includes(b.action)?b.action:'invalid';
    if(b.scope && !['demand','contract'].includes(b.scope)) fail('Área de arquivo inválida.');
    const isContract=b.scope==='contract';
    const sessionTable=isContract?'contract_upload_sessions':'r2_upload_sessions';
    const targetColumn=isContract?'contract_id':'demand_id';
    const access=isContract?contractAccess:demandAccess;
    if(isContract && ['list','saveText','read'].includes(b.action)) {
      await contractAccess(db,user,b.contractId);
      // Text and attachments are served only after checking the existing contract RLS and organization membership.
      if(!process.env.SUPABASE_SERVICE_ROLE_KEY) fail('Documentos de contratos ainda não configurados.',503);
      const admin=adminDb();
      if(b.action==='list') {
        const [files,document]=await Promise.all([
          admin.from('contract_files').select('id,file_name,file_size,mime_type,created_at,uploaded_by').eq('contract_id',b.contractId).order('created_at',{ascending:false}),
          admin.from('contract_documents').select('content,updated_at').eq('contract_id',b.contractId).maybeSingle()
        ]);
        if(files.error||document.error) throw files.error||document.error;
        return Response.json({files:files.data||[],content:document.data?.content||'',updatedAt:document.data?.updated_at||null},{headers});
      }
      if(b.action==='saveText') {
        if(typeof b.content!=='string'||b.content.length>100000) fail('O texto do contrato deve ter até 100.000 caracteres.');
        const updatedAt=new Date().toISOString();
        const {error}=await admin.from('contract_documents').upsert({contract_id:b.contractId,content:b.content,updated_by:user.id,updated_at:updatedAt},{onConflict:'contract_id'});
        if(error) throw error;
        return Response.json({saved:true,updatedAt},{headers});
      }
      const {data:f,error}=await admin.from('contract_files').select('*').eq('id',b.fileId).eq('contract_id',b.contractId).maybeSingle();
      if(error||!f) fail('Anexo indisponível.',404);
      const {data:trusted}=await admin.from(sessionTable).select('id').eq('id',f.id).eq('contract_id',b.contractId).eq('state','completed').maybeSingle();
      if(!trusted) fail('Anexo não finalizado.',404);
      const {s3,bucket}=config();
      if(f.bucket!==bucket) fail('O bucket do anexo foi alterado.',409);
      const url=await getSignedUrl(s3,new GetObjectCommand({Bucket:bucket,Key:f.storage_path,ResponseCacheControl:'private, no-store',ResponseContentDisposition:`attachment; filename*=UTF-8''${encodeURIComponent(f.file_name)}`}),{expiresIn:900});
      return Response.json({url},{headers});
    }
    if (b.action==='read') {
      const {data:v,error}=await db.from('demand_versions').select('*').eq('id',b.versionId).maybeSingle();
      if(error || !v) fail('Arquivo indisponível.',404);
      const {agency}=await demandAccess(db,user,v.demand_id);
      if (!agency && !canReadClientVersion(v.status)) fail('Esta versão ainda não foi compartilhada.',403);
      if (v.storage_provider!=='r2') {
        const {data,error}=await db.storage.from('demand-files').createSignedUrl(v.storage_path,3600);
        if(error) fail('Não foi possível abrir o arquivo antigo.',502);
        return Response.json({url:data.signedUrl},{headers});
      }
      const {s3,bucket}=config();
      // A trusted completed session binds the key to this demand; never sign a key supplied by the browser.
      const {data:trusted}=await adminDb().from('r2_upload_sessions').select('id').eq('object_key',v.storage_path).eq('demand_id',v.demand_id).eq('state','completed').maybeSingle();
      if (!trusted) fail('Arquivo não finalizado.',404);
      const url=await getSignedUrl(s3,new GetObjectCommand({Bucket:bucket,Key:v.storage_path,ResponseCacheControl:'private, no-store'}),{expiresIn:3600});
      return Response.json({url},{headers});
    }
    const {s3,bucket,maxBytes}=config(); const admin=adminDb();
    if (b.action==='init') {
      validateFile(b.file,isContract?Math.min(maxBytes,100*1024*1024):maxBytes,isContract?CONTRACT_TYPES:undefined);
      const {d}=await access(db,user,isContract?b.contractId:b.demandId,true);
      const {count,error:countError}=await admin.from(sessionTable).select('id',{head:true,count:'exact'}).eq('user_id',user.id).eq('state','pending').gt('expires_at',new Date().toISOString());
      if(countError) throw countError;
      if(count>=10) fail('Há muitos envios pendentes. Retome ou cancele um deles.',429);
      const id=randomUUID(); const key=isContract?`${d.organization_id}/${d.client_id}/contracts/${d.id}/${id}`:`${d.organization_id}/${d.client_id}/${d.id}/${id}`;
      const r=await s3.send(new CreateMultipartUploadCommand({Bucket:bucket,Key:key,ContentType:b.file.type,CacheControl:'private, no-store'}));
      const row={id,user_id:user.id,[targetColumn]:d.id,object_key:key,bucket,upload_id:r.UploadId,file_name:b.file.name,file_size:b.file.size,mime_type:b.file.type,fingerprint:b.file.fingerprint,part_size:PART_SIZE};
      const {error}=await admin.from(sessionTable).insert(row);
      if(error) {await s3.send(new AbortMultipartUploadCommand({Bucket:bucket,Key:key,UploadId:r.UploadId})); throw error;}
      return Response.json({id,partSize:PART_SIZE},{headers});
    }
    const {data:s,error}=await admin.from(sessionTable).select('*').eq('id',b.id).eq('user_id',user.id).maybeSingle();
    if(error || !s) fail('Envio indisponível.',404);
    await access(db,user,s[targetColumn],true);
    if(s.bucket!==bucket) fail('O bucket deste envio foi alterado.',409);
    if(s.state==='completed') return Response.json(isContract?{completed:true,fileId:s.id}:{completed:true,versionNumber:s.version_number},{headers});
    if(s.state==='aborted' || Date.parse(s.expires_at)<=Date.now()) fail('Este envio expirou ou foi cancelado. Inicie novamente.',410);
    if(b.action==='resume') {
      if(b.fingerprint!==s.fingerprint) fail('Selecione o mesmo arquivo para retomar.',409);
      const object=await head(s3,s);
      return Response.json({id:s.id,partSize:s.part_size,uploaded:!!object,parts:object?[]:await listParts(s3,s)},{headers});
    }
    if(b.action==='part') {
      const n=b.partNumber;
      if(!Number.isInteger(n)||n<1||n>Math.ceil(s.file_size/s.part_size)) fail('Número de parte inválido.');
      const url=await getSignedUrl(s3,new UploadPartCommand({Bucket:bucket,Key:s.object_key,UploadId:s.upload_id,PartNumber:n}),{expiresIn:900});
      return Response.json({url},{headers});
    }
    if(b.action==='abort') {
      // Completed objects are retained for retrying the database commit.
      if(await head(s3,s)) fail('Arquivo enviado. Retome para finalizar o registro.',409);
      await s3.send(new AbortMultipartUploadCommand({Bucket:bucket,Key:s.object_key,UploadId:s.upload_id}));
      const {error}=await admin.from(sessionTable).update({state:'aborted'}).eq('id',s.id);
      if(error) throw error;
      return Response.json({aborted:true},{headers});
    }
    if(b.action==='complete') {
      let object=await head(s3,s);
      if(!object) {
        const parts=validateParts(await listParts(s3,s),Number(s.file_size),s.part_size);
        await s3.send(new CompleteMultipartUploadCommand({Bucket:bucket,Key:s.object_key,UploadId:s.upload_id,MultipartUpload:{Parts:parts}}));
        object=await head(s3,s);
      }
      if(!object || Number(object.ContentLength)!==Number(s.file_size) || object.ContentType!==s.mime_type) fail('O arquivo enviado não corresponde ao registro.',409);
      const {data,error}=await admin.rpc(isContract?'avesso_finalize_contract_upload':'avesso_finalize_r2_upload',{session_id:s.id,actor_id:user.id});
      if(error) throw error;
      return Response.json(isContract?{completed:true,fileId:data}:{completed:true,versionNumber:data},{headers});
    }
    fail('Operação inválida.');
  } catch(e) {
    const detail=fileErrorDetails(e,operation);
    if(!e.status) console.error('AVESSO file operation failed',detail.log);
    return Response.json({error:detail.message},{status:detail.status,headers});
  }
}
