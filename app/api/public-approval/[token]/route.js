import {adminDb,config} from '../../../../lib/r2-server';
import {fail} from '../../../../lib/upload-policy.mjs';
import {hashApprovalToken} from '../../../../lib/approval-token.mjs';
import {GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
const reply=(body,status=200)=>Response.json(body,{status,headers});

async function getApproval(token){
  let digest;try{digest=hashApprovalToken(token)}catch{fail('Este link de aprovação é inválido ou expirou.',404)}
  const admin=adminDb();
  const {data:link,error}=await admin.from('approval_link_tokens').select('id,client_id,demand_id,demand_version_id,expires_at,revoked_at,used_at').eq('token_hash',digest).maybeSingle();
  if(error||!link||link.revoked_at||Date.parse(link.expires_at)<=Date.now())fail('Este link de aprovação é inválido ou expirou.',404);
  const [{data:demand,error:demandError},{data:version,error:versionError},{data:client,error:clientError},{data:latest,error:latestError}]=await Promise.all([
    admin.from('demands').select('id,client_id,title,status,archived_at').eq('id',link.demand_id).eq('client_id',link.client_id).maybeSingle(),
    admin.from('demand_versions').select('id,demand_id,version_number,status,file_name,file_size,mime_type,storage_path,storage_provider,caption').eq('id',link.demand_version_id).eq('demand_id',link.demand_id).maybeSingle(),
    admin.from('clients').select('id,name').eq('id',link.client_id).maybeSingle(),
    admin.from('demand_versions').select('id').eq('demand_id',link.demand_id).order('version_number',{ascending:false}).limit(1).maybeSingle()
  ]);
  if(demandError||versionError||clientError||latestError||!demand||!version||!client||!latest||demand.archived_at)fail('Este material não está disponível para aprovação.',404);
  const reviewEvent=link.used_at?await admin.from('approval_events').select('note').eq('demand_version_id',version.id).eq('event',demand.status==='approved'?'approved':'changes_requested').is('user_id',null).order('created_at',{ascending:false}).limit(1).maybeSingle():{data:null,error:null};
  const alreadyApproved=link.used_at&&demand.status==='approved'&&version.status==='approved';
  const alreadyRequestedChanges=link.used_at&&demand.status==='adjustments'&&version.status==='changes_requested';
  const alreadyResolved=alreadyApproved||alreadyRequestedChanges;
  if(!alreadyResolved&&(link.used_at||demand.status!=='with_client'||version.status!=='sent_for_review'||latest.id!==version.id))fail('Esta versão não está mais aguardando aprovação.',410);
  let fileUrl=null;
  if(!alreadyResolved){
    if(version.storage_provider==='r2'){
      const {s3,bucket}=config();
      const {data:trusted,error:trustedError}=await admin.from('r2_upload_sessions').select('id,bucket').eq('object_key',version.storage_path).eq('demand_id',demand.id).eq('state','completed').maybeSingle();
      if(trustedError||!trusted||trusted.bucket!==bucket)fail('Arquivo indisponível.',404);
      fileUrl=await getSignedUrl(s3,new GetObjectCommand({Bucket:bucket,Key:version.storage_path,ResponseCacheControl:'private, no-store'}),{expiresIn:600});
    }else if(version.storage_provider==='supabase'){
      const {data,error}=await admin.storage.from('demand-files').createSignedUrl(version.storage_path,600);
      if(error||!data?.signedUrl)fail('Arquivo indisponível.',404);
      fileUrl=data.signedUrl;
    }else fail('Arquivo indisponível.',404);
  }
  return {admin,digest,alreadyResolved,status:alreadyApproved?'approved':alreadyRequestedChanges?'changes_requested':'pending',data:{clientName:client.name,title:demand.title,versionNumber:version.version_number,fileName:version.file_name,mimeType:version.mime_type,fileSize:version.file_size,caption:version.caption||'',fileUrl,status:alreadyApproved?'approved':alreadyRequestedChanges?'changes_requested':'pending',reviewNote:reviewEvent.data?.note||''}};
}

export async function GET(_request,{params}){
  try{const {token}=await params;const result=await getApproval(token);return reply(result.data)}
  catch(e){if(!e.status)console.error('AVESSO public approval read failed',{code:e.code||e.name});return reply({error:e.status?e.message:'Não foi possível carregar o material.'},e.status||500)}
}

export async function POST(_request,{params}){
  try{
    const {token}=await params;const result=await getApproval(token);
    const raw=await _request.text();if(raw.length>32768)fail('Solicitação muito grande.',413);
    let body={};try{body=raw?JSON.parse(raw):{}}catch{fail('Solicitação inválida.')}
    const decision=body.decision||'approve',note=typeof body.note==='string'?body.note.trim():'';
    if(!['approve','changes'].includes(decision))fail('Escolha aprovar o material ou solicitar ajustes.');
    if(decision==='changes'&&(note.length<3||note.length>20000))fail('Descreva os ajustes necessários (de 3 a 20.000 caracteres).');
    if(result.alreadyResolved)return reply({status:result.status});
    const {data,error}=await result.admin.rpc('avesso_review_public_link',{token_digest:result.digest,decision,note});
    if(error){console.error('AVESSO public approval transaction failed',{code:error.code});fail('Esta versão não está mais aguardando aprovação.',409)}
    return reply({status:data||(decision==='approve'?'approved':'changes_requested')});
  }catch(e){if(!e.status)console.error('AVESSO public approval failed',{code:e.code||e.name});return reply({error:e.status?e.message:'Não foi possível registrar a aprovação.'},e.status||500)}
}
