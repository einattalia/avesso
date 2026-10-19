import {adminDb,config} from '../../../../lib/r2-server';
import {fail} from '../../../../lib/upload-policy.mjs';
import {hashClientPortalToken} from '../../../../lib/client-portal-token.mjs';
import {GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
const reply=(body,status=200)=>Response.json(body,{status,headers});

async function signedAsset(admin,demand,version){
  if(version.storage_provider==='r2'){
    const {s3,bucket}=config();
    const {data:trusted,error}=await admin.from('r2_upload_sessions').select('id,bucket').eq('object_key',version.storage_path).eq('demand_id',demand.id).eq('state','completed').maybeSingle();
    if(error||!trusted||trusted.bucket!==bucket)fail('Arquivo indisponível.',404);
    return getSignedUrl(s3,new GetObjectCommand({Bucket:bucket,Key:version.storage_path,ResponseCacheControl:'private, no-store'}),{expiresIn:3600});
  }
  if(version.storage_provider==='supabase'){
    const {data,error}=await admin.storage.from('demand-files').createSignedUrl(version.storage_path,3600);
    if(error||!data?.signedUrl)fail('Arquivo indisponível.',404);
    return data.signedUrl;
  }
  fail('Arquivo indisponível.',404);
}

export async function GET(_request,{params}){
  try{
    const {token}=await params;
    let digest;try{digest=hashClientPortalToken(token)}catch{fail('Este link do portal é inválido ou foi revogado.',404)}
    const admin=adminDb();
    const {data:access,error:accessError}=await admin.from('client_portal_tokens').select('client_id,organization_id,revoked_at').eq('token_hash',digest).maybeSingle();
    if(accessError)throw accessError;
    if(!access||access.revoked_at)fail('Este link do portal é inválido ou foi revogado.',404);

    const {data:client,error:clientError}=await admin.from('clients').select('id,name,organization_id').eq('id',access.client_id).eq('organization_id',access.organization_id).maybeSingle();
    if(clientError)throw clientError;
    if(!client)fail('Este portal não está disponível.',404);

    const {data:demands,error:demandError}=await admin.from('demands').select('id,title,type,status,publish_date,publish_time,approved_at,delivered_at,updated_at').eq('organization_id',client.organization_id).eq('client_id',client.id).is('archived_at',null).in('status',['approved','awaiting_scheduling','scheduled','delivered','posted']).order('publish_date',{ascending:true,nullsFirst:false});
    if(demandError)throw demandError;
    const ids=(demands||[]).map(d=>d.id);
    if(!ids.length)return Response.json({clientName:client.name,arts:[]},{headers});
    const [{data:versions,error:versionsError},{data:sets,error:setsError}]=await Promise.all([
      admin.from('demand_versions').select('id,demand_id,version_number,status,file_name,file_size,mime_type,storage_path,storage_provider,caption,approval_option_set_id,removed_at').in('demand_id',ids).eq('status','approved').is('removed_at',null).order('version_number',{ascending:true}),
      admin.from('approval_option_sets').select('id,demand_id,state,selected_version_id,review_mode,created_at').in('demand_id',ids).eq('state','selected').order('created_at',{ascending:false})
    ]);
    if(versionsError||setsError)throw versionsError||setsError;
    const byDemand=new Map();
    for(const version of versions||[]){const list=byDemand.get(version.demand_id)||[];list.push(version);byDemand.set(version.demand_id,list)}
    const setsByDemand=new Map();
    for(const set of sets||[]){if(!setsByDemand.has(set.demand_id))setsByDemand.set(set.demand_id,set)}
    const arts=[];
    for(const demand of demands||[]){
      const approvedVersions=byDemand.get(demand.id)||[];
      const selectedSet=setsByDemand.get(demand.id);
      let visible=[];
      if(selectedSet){
        const setVersions=approvedVersions.filter(version=>version.approval_option_set_id===selectedSet.id);
        visible=selectedSet.review_mode==='bundle'?setVersions:setVersions.filter(version=>version.id===selectedSet.selected_version_id);
      }else{
        visible=approvedVersions.filter(version=>!version.approval_option_set_id).slice(-1);
      }
      if(!visible.length)continue;
      const assets=await Promise.all(visible.map(async version=>({id:version.id,versionNumber:version.version_number,fileName:version.file_name,mimeType:version.mime_type,caption:version.caption||'',fileUrl:await signedAsset(admin,demand,version)})));
      arts.push({id:demand.id,title:demand.title,type:demand.type,status:demand.status,publishDate:demand.publish_date||null,publishTime:demand.publish_time||null,approvedAt:demand.approved_at||null,deliveredAt:demand.delivered_at||null,assets});
    }
    return Response.json({clientName:client.name,arts},{headers});
  }catch(error){
    if(!error.status)console.error('AVESSO client portal read failed',{code:error.code||error.name});
    return reply({error:error.status?error.message:'Não foi possível carregar o portal.'},error.status||500);
  }
}
