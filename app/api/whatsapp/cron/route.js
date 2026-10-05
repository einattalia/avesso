import {adminDb} from '../../../../lib/r2-server';
import {dispatchApproval} from '../../../../lib/whatsapp-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request) {
  if(!process.env.CRON_SECRET||request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return Response.json({error:'Sem acesso.'},{status:401});
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY)return Response.json({error:'Banco não configurado.'},{status:503});
  const admin=adminDb();
  const {data,error}=await admin.from('approval_notifications').select('demand_id').or('state.eq.sending,and(state.in.(pending,failed),attempts.lt.3)').order('created_at').limit(2);
  if(error)return Response.json({error:'Fila indisponível.'},{status:503});
  const outcomes=[];for(const job of data||[])outcomes.push((await dispatchApproval(admin,job.demand_id)).state);
  return Response.json({processed:outcomes.length,outcomes},{headers:{'Cache-Control':'no-store'}});
}
