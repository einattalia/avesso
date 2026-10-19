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
  const {data:link,error}=await admin.from('approval_link_tokens').select('id,client_id,demand_id,demand_version_id,approval_option_set_id,expires_at,revoked_at,used_at').eq('token_hash',digest).maybeSingle();
  if(error||!link||link.revoked_at||Date.parse(link.expires_at)<=Date.now())fail('Este link de aprovação é inválido ou expirou.',404);
  const [{data:demand,error:demandError},{data:version,error:versionError},{data:client,error:clientError},{data:latest,error:latestError},{data:optionSet,error:setError}]=await Promise.all([
    admin.from('demands').select('id,client_id,title,status,archived_at,publish_date,publish_time').eq('id',link.demand_id).eq('client_id',link.client_id).maybeSingle(),
    admin.from('demand_versions').select('id,demand_id,version_number,status,file_name,file_size,mime_type,storage_path,storage_provider,caption').eq('id',link.demand_version_id).eq('demand_id',link.demand_id).maybeSingle(),
    admin.from('clients').select('id,name').eq('id',link.client_id).maybeSingle(),
    admin.from('demand_versions').select('id').eq('demand_id',link.demand_id).order('version_number',{ascending:false}).limit(1).maybeSingle(),
    link.approval_option_set_id?admin.from('approval_option_sets').select('id,state,selected_version_id,review_note').eq('id',link.approval_option_set_id).eq('demand_id',link.demand_id).maybeSingle():Promise.resolve({data:null,error:null})
  ]);
  if(demandError||versionError||clientError||latestError||setError||!demand||!version||!client||!latest||demand.archived_at)fail('Este material não está disponível para aprovação.',404);
  let versions=[version];
  if(optionSet){
    const {data:groupVersions,error:groupError}=await admin.from('demand_versions').select('id,demand_id,version_number,status,file_name,file_size,mime_type,storage_path,storage_provider,caption,approval_option_set_id').eq('demand_id',demand.id).eq('approval_option_set_id',optionSet.id).order('version_number',{ascending:true});
    if(groupError||!groupVersions||groupVersions.length<2)fail('As opções não estão disponíveis para aprovação.',404);
    versions=groupVersions;
  }
  const reviewEvent=link.used_at?await admin.from('approval_events').select('note').eq('demand_version_id',version.id).eq('event',demand.status==='approved'?'approved':'changes_requested').is('user_id',null).order('created_at',{ascending:false}).limit(1).maybeSingle():{data:null,error:null};
  const alreadyApproved=link.used_at&&demand.status==='approved'&&(optionSet?optionSet.state==='selected'&&versions.some(v=>v.id===optionSet.selected_version_id&&v.status==='approved'):version.status==='approved');
  const alreadyRequestedChanges=link.used_at&&demand.status==='adjustments'&&(optionSet?optionSet.state==='changes_requested':version.status==='changes_requested');
  const alreadyResolved=alreadyApproved||alreadyRequestedChanges;
  if(!alreadyResolved&&(link.used_at||demand.status!=='with_client'||versions.some(v=>v.status!=='sent_for_review')||(!optionSet&&latest.id!==version.id)))fail('Esta versão não está mais aguardando aprovação.',410);
  async function signedFile(v){
    if(alreadyResolved)return null;
    if(v.storage_provider==='r2'){
      const {s3,bucket}=config();
      const {data:trusted,error:trustedError}=await admin.from('r2_upload_sessions').select('id,bucket').eq('object_key',v.storage_path).eq('demand_id',demand.id).eq('state','completed').maybeSingle();
      if(trustedError||!trusted||trusted.bucket!==bucket)fail('Arquivo indisponível.',404);
      return getSignedUrl(s3,new GetObjectCommand({Bucket:bucket,Key:v.storage_path,ResponseCacheControl:'private, no-store'}),{expiresIn:600});
    }
    if(v.storage_provider==='supabase'){
      const {data,error}=await admin.storage.from('demand-files').createSignedUrl(v.storage_path,600);
      if(error||!data?.signedUrl)fail('Arquivo indisponível.',404);
      return data.signedUrl;
    }
    fail('Arquivo indisponível.',404);
  }
  const options=await Promise.all(versions.map(async v=>({id:v.id,versionNumber:v.version_number,fileName:v.file_name,mimeType:v.mime_type,fileSize:v.file_size,caption:v.caption||'',fileUrl:await signedFile(v)})));
  return {admin,digest,alreadyResolved,status:alreadyApproved?'approved':alreadyRequestedChanges?'changes_requested':'pending',data:{clientName:client.name,title:demand.title,publishDate:demand.publish_date||null,publishTime:demand.publish_time||null,versionNumber:version.version_number,fileName:version.file_name,mimeType:version.mime_type,fileSize:version.file_size,caption:version.caption||'',fileUrl:await signedFile(version),options:optionSet?options:null,selectedVersionId:optionSet?.selected_version_id||null,status:alreadyApproved?'approved':alreadyRequestedChanges?'changes_requested':'pending',reviewNote:optionSet?.review_note||reviewEvent.data?.note||''}};
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
    const selectedVersionId=typeof body.selectedVersionId==='string'&&body.selectedVersionId.trim()?body.selectedVersionId:null;
    const {data,error}=await result.admin.rpc('avesso_review_public_link_v2',{token_digest:result.digest,decision,note,selected_version:selectedVersionId});
    if(error){
      console.error('AVESSO public approval transaction failed',{code:error.code});
      const reason=String(error.message||'');
      if(/não está mais aguardando aprovação|Approval link unavailable/i.test(reason))fail('Esta versão foi substituída ou a aprovação já foi encerrada. Peça à equipe Avesso um novo link para o material atual.',409);
      if(error.code==='PGRST202'||error.code==='42883')fail('O portal de aprovação precisa de uma atualização de configuração. Avise a equipe Avesso.',503);
      fail('Não foi possível registrar sua decisão agora. Atualize a página e tente novamente; se o erro continuar, peça um novo link à equipe Avesso.',503);
    }
    return reply({status:data||(decision==='approve'?'approved':'changes_requested')});
  }catch(e){if(!e.status)console.error('AVESSO public approval failed',{code:e.code||e.name});return reply({error:e.status?e.message:'Não foi possível registrar a aprovação.'},e.status||500)}
}
