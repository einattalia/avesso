import {authenticate,adminDb,demandAccess} from '../../../lib/r2-server';
import {fail} from '../../../lib/upload-policy.mjs';
import {dispatchApproval} from '../../../lib/whatsapp-server';
import {approvalUrl} from '../../../lib/production-policy.mjs';
import {createApprovalToken,decryptApprovalToken,encryptApprovalToken,hashApprovalToken} from '../../../lib/approval-token.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store'};
async function issueApprovalLink(admin,demandId,versionId,base){
  const token=createApprovalToken();
  const {error}=await admin.rpc('avesso_issue_approval_link_v2',{target_demand:demandId,target_version:versionId,token_digest:hashApprovalToken(token),encrypted_value:encryptApprovalToken(token,process.env.SUPABASE_SERVICE_ROLE_KEY),link_expires_at:new Date(Date.now()+14*86400000).toISOString()});
  if(error)throw error;
  return approvalUrl(base,token);
}
export async function POST(request) {
  try {
    const {db,user}=await authenticate(request);
    const raw=await request.text();if(raw.length>32768)fail('Solicitação muito grande.',413);
    let b;try{b=JSON.parse(raw)}catch{fail('Solicitação inválida.')}
    if(!b||!['send','deliver','status','approve','changes','notifications','retryNotification','history','approvalLink'].includes(b.action))fail('Operação inválida.');
    const {agency}=await demandAccess(db,user,b.demandId,!['approve','changes'].includes(b.action));
    if(!process.env.SUPABASE_SERVICE_ROLE_KEY)fail('Fluxo de produção ainda não configurado.',503);
    const admin=adminDb();
    if(b.action==='approvalLink') {
      if(!agency)fail('Somente a agência pode compartilhar o link de aprovação.',403);
      const {data:demand,error:demandError}=await admin.from('demands').select('id,client_id,status,archived_at').eq('id',b.demandId).maybeSingle();
      if(demandError||!demand||demand.archived_at||demand.status!=='with_client')fail('Esta demanda não está aguardando aprovação.',409);
      const {data:version,error:versionError}=await admin.from('demand_versions').select('id,status').eq('demand_id',demand.id).order('version_number',{ascending:false}).limit(1).maybeSingle();
      if(versionError||!version||version.status!=='sent_for_review')fail('Esta versão não está aguardando aprovação.',409);
      const {data:current,error:linkError}=await admin.from('approval_link_tokens').select('token_encrypted,expires_at').eq('demand_id',demand.id).eq('demand_version_id',version.id).is('revoked_at',null).is('used_at',null).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(linkError)throw linkError;
      const base=process.env.APP_URL||new URL(request.url).origin;
      if(current?.token_encrypted&&Date.parse(current.expires_at)>Date.now()) {
        try{return Response.json({status:demand.status,url:approvalUrl(base,decryptApprovalToken(current.token_encrypted,process.env.SUPABASE_SERVICE_ROLE_KEY))},{headers});}catch{}
      }
      const url=await issueApprovalLink(admin,demand.id,version.id,base);
      return Response.json({status:demand.status,url},{headers});
    }
    if(b.action==='history') {
      const {data,error}=await admin.from('production_activity').select('id,from_status,to_status,created_at').eq('demand_id',b.demandId).order('created_at',{ascending:false}).limit(30);
      if(error)throw error;return Response.json({history:data||[]},{headers});
    }
    if(['notifications','retryNotification'].includes(b.action)) {
      if(!agency)fail('Somente a agência pode consultar avisos.',403);
      let notice=null;
      if(b.action==='retryNotification')notice=await dispatchApproval(admin,b.demandId);
      const {data,error}=await admin.from('approval_notifications').select('id,state,error_code,created_at,attempts').eq('demand_id',b.demandId).order('created_at',{ascending:false}).limit(5);
      if(error)throw error;return Response.json({notifications:data||[],notice},{headers});
    }
    if(['approve','changes'].includes(b.action)&&agency)fail('A decisão deve ser registrada pelo cliente no portal.',403);
    if(b.action==='changes'&&(!b.note?.trim()||b.note.length>20000))fail('Descreva os ajustes necessários (até 20.000 caracteres).');
    const {data,error}=await (['approve','changes'].includes(b.action)?admin.rpc('avesso_review_with_note',{target_demand:b.demandId,target_version:b.versionId,actor_id:user.id,decision:b.action,note:b.note||''}):admin.rpc('avesso_production_action',{target_demand:b.demandId,target_version:b.versionId||null,actor_id:user.id,action_name:b.action,new_status:b.status||null}));
    if(error){console.error('AVESSO production transaction failed',{code:error.code});fail('Não foi possível atualizar a atividade. Confira se esta versão ainda está disponível e se o SQL de briefing e produção foi executado.',409)}
    let notice=null,url=null;
    if(b.action==='send') {
      const base=process.env.APP_URL||new URL(request.url).origin;
      try{url=await issueApprovalLink(admin,b.demandId,b.versionId,base)}catch(error){console.error('AVESSO approval link issue failed',{code:error.code});fail('A aprovação foi enviada, mas o link seguro não pôde ser criado. Verifique se o SQL do portal foi instalado.',503)}
      const linkToken=new URL(url).pathname.split('/').at(-1);
      try{notice=await dispatchApproval(admin,b.demandId,linkToken)}catch{notice={state:'failed',message:'Aprovação publicada; não foi possível enviar o aviso pelo WhatsApp.'}}
    }
    return Response.json({status:data,notice,url},{headers});
  }catch(e){if(!e.status)console.error('AVESSO production operation failed',{code:e.code||e.name});return Response.json({error:e.status?e.message:'Não foi possível concluir esta ação.'},{status:e.status||500,headers})}
}
