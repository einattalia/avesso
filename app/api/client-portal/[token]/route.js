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
    return getSignedUrl(s3,new GetObjectCommand({Bucket:bucket,Key:version.storage_path,ResponseCacheControl:'private, no-store'}),{expiresIn:600});
  }
  if(version.storage_provider==='supabase'){
    const {data,error}=await admin.storage.from('demand-files').createSignedUrl(version.storage_path,600);
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

    const {data:client,error:clientError}=await admin.from('clients').select('id,name,organization_id,photo_path').eq('id',access.client_id).eq('organization_id',access.organization_id).maybeSingle();
    if(clientError)throw clientError;
    if(!client)fail('Este portal não está disponível.',404);

    let clientLogoUrl=null;
    if(client.photo_path){
      try{const {data:logo}=await admin.storage.from('avesso-profile-images').createSignedUrl(client.photo_path,3600);clientLogoUrl=logo?.signedUrl||null}catch{}
    }
    const {data:plans,error:plansError}=await admin.from('client_monthly_plans').select('id,plan_month,status,shared_at,client_rating,client_feedback,client_feedback_at').eq('organization_id',client.organization_id).eq('client_id',client.id).eq('status','shared').order('plan_month',{ascending:false});
    if(plansError)throw plansError;
    const planIds=(plans||[]).map(plan=>plan.id);
    let monthlyPlans=[];
    if(planIds.length){
      const {data:planItems,error:itemsError}=await admin.from('client_monthly_plan_items').select('id,plan_id,position,title,description,format,designer_id,videomaker_id,scheduled_date,status,review_note,responded_at').in('plan_id',planIds).is('removed_at',null).order('position',{ascending:true});
      if(itemsError)throw itemsError;
      const teamIds=[...new Set((planItems||[]).flatMap(item=>[item.designer_id,item.videomaker_id]).filter(Boolean))];
      let teamById=new Map();
      if(teamIds.length){const {data:team,error:teamError}=await admin.from('agency_team_members').select('id,name').eq('organization_id',client.organization_id).in('id',teamIds);if(teamError)throw teamError;teamById=new Map((team||[]).map(person=>[person.id,person.name]))}
      const itemsByPlan=new Map();
      for(const item of planItems||[]){const withNames={...item,designerName:teamById.get(item.designer_id)||null,videomakerName:teamById.get(item.videomaker_id)||null};const list=itemsByPlan.get(item.plan_id)||[];list.push(withNames);itemsByPlan.set(item.plan_id,list)}
      monthlyPlans=(plans||[]).map(plan=>({id:plan.id,planMonth:plan.plan_month,status:plan.status,sharedAt:plan.shared_at,clientRating:plan.client_rating,clientFeedback:plan.client_feedback,clientFeedbackAt:plan.client_feedback_at,items:itemsByPlan.get(plan.id)||[]}));
    }
    const {data:demands,error:demandError}=await admin.from('demands').select('id,title,type,status,publish_date,publish_time,approved_at,delivered_at,updated_at').eq('organization_id',client.organization_id).eq('client_id',client.id).is('archived_at',null).in('status',['adjustments','approved','awaiting_scheduling','scheduled','delivered','posted']).order('publish_date',{ascending:true,nullsFirst:false});
    if(demandError)throw demandError;
    const ids=(demands||[]).map(d=>d.id);
    if(!ids.length)return Response.json({clientName:client.name,clientLogoUrl,arts:[],monthlyPlans},{headers});
    const [{data:versions,error:versionsError},{data:sets,error:setsError}]=await Promise.all([
      admin.from('demand_versions').select('id,demand_id,version_number,status,file_name,file_size,mime_type,storage_path,storage_provider,caption,approval_option_set_id,removed_at').in('demand_id',ids).in('status',['approved','changes_requested']).is('removed_at',null).order('version_number',{ascending:true}),
      admin.from('approval_option_sets').select('id,demand_id,state,selected_version_id,review_mode,review_note,created_at').in('demand_id',ids).in('state',['selected','changes_requested']).order('created_at',{ascending:false})
    ]);
    if(versionsError||setsError)throw versionsError||setsError;
    const byDemand=new Map();
    for(const version of versions||[]){const list=byDemand.get(version.demand_id)||[];list.push(version);byDemand.set(version.demand_id,list)}
    const selectedByDemand=new Map(),requestedByDemand=new Map();
    for(const set of sets||[]){
      const target=set.state==='changes_requested'?requestedByDemand:selectedByDemand;
      if(!target.has(set.demand_id))target.set(set.demand_id,set);
    }
    const requestedVersionIds=(versions||[]).filter(version=>version.status==='changes_requested').map(version=>version.id);
    let events=[];
    if(requestedVersionIds.length){
      const {data,error}=await admin.from('approval_events').select('demand_version_id,note,created_at').in('demand_version_id',requestedVersionIds).eq('event','changes_requested').is('user_id',null).order('created_at',{ascending:false});
      if(error)throw error;
      events=data||[];
    }
    const noteByVersion=new Map();
    for(const event of events){if(!noteByVersion.has(event.demand_version_id)&&event.note)noteByVersion.set(event.demand_version_id,event.note)}
    const arts=[];
    for(const demand of demands||[]){
      const demandVersions=byDemand.get(demand.id)||[];
      let visible=[],reviewNote='';
      if(demand.status==='adjustments'){
        const requestedSet=requestedByDemand.get(demand.id);
        const requestedVersions=demandVersions.filter(version=>version.status==='changes_requested');
        if(requestedSet){
          const setVersions=requestedVersions.filter(version=>version.approval_option_set_id===requestedSet.id);
          visible=requestedSet.review_mode==='bundle'?setVersions:setVersions;
          reviewNote=requestedSet.review_note||setVersions.map(version=>noteByVersion.get(version.id)).find(Boolean)||'';
        }else{
          visible=requestedVersions.filter(version=>!version.approval_option_set_id).slice(-1);
          reviewNote=visible.map(version=>noteByVersion.get(version.id)).find(Boolean)||'';
        }
      }else{
        const approvedVersions=demandVersions.filter(version=>version.status==='approved');
        const selectedSet=selectedByDemand.get(demand.id);
        if(selectedSet){
          const setVersions=approvedVersions.filter(version=>version.approval_option_set_id===selectedSet.id);
          visible=selectedSet.review_mode==='bundle'?setVersions:setVersions.filter(version=>version.id===selectedSet.selected_version_id);
        }else{
          visible=approvedVersions.filter(version=>!version.approval_option_set_id).slice(-1);
        }
      }
      if(!visible.length)continue;
      const assets=await Promise.all(visible.map(async version=>({id:version.id,versionNumber:version.version_number,fileName:version.file_name,mimeType:version.mime_type,caption:version.caption||'',fileUrl:await signedAsset(admin,demand,version)})));
      arts.push({id:demand.id,title:demand.title,type:demand.type,status:demand.status,publishDate:demand.publish_date||null,publishTime:demand.publish_time||null,approvedAt:demand.approved_at||null,deliveredAt:demand.delivered_at||null,reviewNote,assets});
    }
    return Response.json({clientName:client.name,clientLogoUrl,arts,monthlyPlans},{headers});
  }catch(error){
    if(!error.status)console.error('AVESSO client portal read failed',{code:error.code||error.name});
    return reply({error:error.status?error.message:'Não foi possível carregar o portal.'},error.status||500);
  }
}

export async function POST(request,{params}){
  try{
    const {token}=await params;
    let digest;try{digest=hashClientPortalToken(token)}catch{fail('Este link do portal é inválido ou foi revogado.',404)}
    const raw=await request.text();if(raw.length>32768)fail('Solicitação muito grande.',413);
    let body;try{body=JSON.parse(raw)}catch{fail('Solicitação inválida.')}
    if(!body||!['approve','changes','evaluate'].includes(body.decision))fail('Decisão inválida.');
    const note=typeof body.note==='string'?body.note.trim():'';
    if(body.decision==='changes'&&(note.length<3||note.length>20000))fail('Descreva os ajustes necessários (de 3 a 20.000 caracteres).');
    const admin=adminDb();
    const {data:access,error:accessError}=await admin.from('client_portal_tokens').select('client_id,organization_id,revoked_at').eq('token_hash',digest).maybeSingle();
    if(accessError)throw accessError;
    if(!access||access.revoked_at)fail('Este link do portal é inválido ou foi revogado.',404);
    if(body.decision==='evaluate'){
      if(typeof body.planId!=='string')fail('Planejamento inválido.');
      if(!Number.isInteger(body.rating)||body.rating<1||body.rating>5)fail('Selecione uma nota de 1 a 5 estrelas.');
      if(body.feedback!==undefined&&typeof body.feedback!=='string')fail('Comentário inválido.');
      const feedback=(body.feedback||'').trim();
      if(feedback.length>4000)fail('O comentário deve ter até 4.000 caracteres.');
      const {data:plan,error:planError}=await admin.from('client_monthly_plans').select('id,status').eq('id',body.planId).eq('client_id',access.client_id).eq('organization_id',access.organization_id).maybeSingle();
      if(planError)throw planError;
      if(!plan||plan.status!=='shared')fail('Este planejamento não está disponível para avaliação.',404);
      const now=new Date().toISOString();
      const {error:updateError}=await admin.from('client_monthly_plans').update({client_rating:body.rating,client_feedback:feedback||null,client_feedback_at:now,updated_at:now}).eq('id',plan.id).eq('client_id',access.client_id).eq('organization_id',access.organization_id);
      if(updateError)throw updateError;
      return reply({saved:true,rating:body.rating,feedback:feedback||null,submittedAt:now});
    }
    if(typeof body.itemId!=='string')fail('Decisão inválida.');
    const {data:item,error:itemError}=await admin.from('client_monthly_plan_items').select('id,plan_id,client_id,organization_id,title,description,format,designer_id,videomaker_id,scheduled_date,status,review_note,removed_at').eq('id',body.itemId).eq('client_id',access.client_id).eq('organization_id',access.organization_id).is('removed_at',null).maybeSingle();
    if(itemError)throw itemError;
    if(!item)fail('Este conteúdo não está disponível para o cliente.',404);
    const {data:plan,error:planError}=await admin.from('client_monthly_plans').select('id,status,plan_month').eq('id',item.plan_id).eq('client_id',access.client_id).eq('organization_id',access.organization_id).maybeSingle();
    if(planError)throw planError;
    if(!plan||plan.status!=='shared')fail('Este planejamento não está mais aguardando retorno.',409);
    if(!['pending','changes_requested'].includes(item.status))fail('Esta arte já foi aprovada ou atualizada pela equipe.',409);
    const now=new Date().toISOString(),nextStatus=body.decision==='approve'?'approved':'changes_requested';
    const {data:updated,error:updateError}=await admin.from('client_monthly_plan_items').update({status:nextStatus,review_note:nextStatus==='changes_requested'?note:null,responded_at:now,updated_at:now}).eq('id',item.id).eq('status',item.status).select('id').maybeSingle();
    if(updateError)throw updateError;
    if(!updated)fail('Esta arte acabou de ser atualizada. Recarregue a página e tente novamente.',409);
    const event={plan_id:plan.id,item_id:item.id,organization_id:access.organization_id,client_id:access.client_id,actor_type:'client',event:nextStatus,actor_name:'Cliente',note:nextStatus==='changes_requested'?note:null,snapshot:{title:item.title,description:item.description,format:item.format||null,scheduled_date:item.scheduled_date||null}};
    const {error:eventError}=await admin.from('client_monthly_plan_item_events').insert(event);
    if(eventError)throw eventError;
    return reply({status:nextStatus});
  }catch(error){
    if(!error.status)console.error('AVESSO client monthly plan decision failed',{code:error.code||error.name});
    return reply({error:error.status?error.message:'Não foi possível registrar sua resposta.'},error.status||500);
  }
}
