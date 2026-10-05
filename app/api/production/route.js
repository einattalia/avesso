import {authenticate,adminDb,demandAccess} from '../../../lib/r2-server';
import {fail} from '../../../lib/upload-policy.mjs';
import {dispatchApproval} from '../../../lib/whatsapp-server';
import {approvalUrl} from '../../../lib/production-policy.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store'};
export async function POST(request) {
  try {
    const {db,user}=await authenticate(request);
    const raw=await request.text();if(raw.length>8192)fail('Solicitação muito grande.',413);
    let b;try{b=JSON.parse(raw)}catch{fail('Solicitação inválida.')}
    if(!b||!['send','deliver','status','approve','changes','notifications','retryNotification','history'].includes(b.action))fail('Operação inválida.');
    const {agency}=await demandAccess(db,user,b.demandId,!['approve','changes'].includes(b.action));
    if(!process.env.SUPABASE_SERVICE_ROLE_KEY)fail('Fluxo de produção ainda não configurado.',503);
    const admin=adminDb();
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
    const {data,error}=await admin.rpc('avesso_production_action',{target_demand:b.demandId,target_version:b.versionId||null,actor_id:user.id,action_name:b.action,new_status:b.status||null});
    if(error){console.error('AVESSO production transaction failed',{code:error.code});fail('Não foi possível atualizar a atividade. Confira se esta versão ainda está disponível e se o SQL de briefing e produção foi executado.',409)}
    let notice=null,url=null;
    if(b.action==='send') {
      const base=process.env.APP_URL;
      if(base){try{url=approvalUrl(base,b.demandId)}catch{}}
      try{notice=await dispatchApproval(admin,b.demandId)}catch{notice={state:'failed',message:'Aprovação publicada; não foi possível enviar o aviso pelo WhatsApp.'}}
    }
    return Response.json({status:data,notice,url},{headers});
  }catch(e){if(!e.status)console.error('AVESSO production operation failed',{code:e.code||e.name});return Response.json({error:e.status?e.message:'Não foi possível concluir esta ação.'},{status:e.status||500,headers})}
}
