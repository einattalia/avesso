import {randomUUID} from 'node:crypto';
import {AbortMultipartUploadCommand,CompleteMultipartUploadCommand,CreateMultipartUploadCommand,GetObjectCommand,HeadObjectCommand,ListPartsCommand,UploadPartCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {adminDb,authenticate,config,demandAccess} from '../../../lib/r2-server';
import {PART_SIZE,canReadClientVersion,fail,validateFile,validateParts} from '../../../lib/upload-policy.mjs';
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
  try {
    const {db,user}=await authenticate(request);
    if (Number(request.headers.get('content-length')||0)>16384) fail('Solicitação muito grande.',413);
    const raw=await request.text(); if(raw.length>16384) fail('Solicitação muito grande.',413);
    let b; try {b=JSON.parse(raw);} catch {fail('Solicitação inválida.');}
    if (!b || typeof b!=='object') fail('Solicitação inválida.');
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
      validateFile(b.file,maxBytes);
      const {d}=await demandAccess(db,user,b.demandId,true);
      const {count,error:countError}=await admin.from('r2_upload_sessions').select('id',{head:true,count:'exact'}).eq('user_id',user.id).eq('state','pending').gt('expires_at',new Date().toISOString());
      if(countError) throw countError;
      if(count>=10) fail('Há muitos envios pendentes. Retome ou cancele um deles.',429);
      const id=randomUUID(); const key=`${d.organization_id}/${d.client_id}/${d.id}/${id}`;
      const r=await s3.send(new CreateMultipartUploadCommand({Bucket:bucket,Key:key,ContentType:b.file.type,CacheControl:'private, no-store'}));
      const row={id,user_id:user.id,demand_id:d.id,object_key:key,bucket,upload_id:r.UploadId,file_name:b.file.name,file_size:b.file.size,mime_type:b.file.type,fingerprint:b.file.fingerprint,part_size:PART_SIZE};
      const {error}=await admin.from('r2_upload_sessions').insert(row);
      if(error) {await s3.send(new AbortMultipartUploadCommand({Bucket:bucket,Key:key,UploadId:r.UploadId})); throw error;}
      return Response.json({id,partSize:PART_SIZE},{headers});
    }
    const {data:s,error}=await admin.from('r2_upload_sessions').select('*').eq('id',b.id).eq('user_id',user.id).maybeSingle();
    if(error || !s) fail('Envio indisponível.',404);
    await demandAccess(db,user,s.demand_id,true);
    if(s.bucket!==bucket) fail('O bucket deste envio foi alterado.',409);
    if(s.state==='completed') return Response.json({completed:true,versionNumber:s.version_number},{headers});
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
      const {error}=await admin.from('r2_upload_sessions').update({state:'aborted'}).eq('id',s.id);
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
      const {data,error}=await admin.rpc('avesso_finalize_r2_upload',{session_id:s.id,actor_id:user.id});
      if(error) throw error;
      return Response.json({completed:true,versionNumber:data},{headers});
    }
    fail('Operação inválida.');
  } catch(e) {
    if(!e.status) console.error('AVESSO file operation failed',e.code||e.name);
    return Response.json({error:e.status?e.message:'Não foi possível concluir. Tente novamente; o envio pode ser retomado.'},{status:e.status||500,headers});
  }
}
