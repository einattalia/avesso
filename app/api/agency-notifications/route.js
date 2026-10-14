import {adminDb,authenticate} from '../../../lib/r2-server';
import {fail} from '../../../lib/upload-policy.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};

export async function GET(request){
 try{
  const {db,user}=await authenticate(request);
  const params=new URL(request.url).searchParams;
  const organizationId=params.get('organizationId');
  const since=params.get('since');
  if(!/^[0-9a-f-]{36}$/i.test(organizationId||''))fail('Organização inválida.');
  const sinceDate=since?new Date(since):new Date(Date.now()-15000);
  if(Number.isNaN(sinceDate.getTime()))fail('Período inválido.');
  const {data:members,error:memberError}=await db.from('organization_members').select('role').eq('organization_id',organizationId).eq('user_id',user.id).eq('is_active',true);
  if(memberError||!members?.some(member=>member.role&&member.role!=='client_user'))fail('Sem acesso às notificações desta organização.',403);
  const {data,error}=await adminDb().from('production_activity')
   .select('id,demand_id,to_status,created_at,demand:demands!inner(title,organization_id,clients(name))')
   .eq('demand.organization_id',organizationId)
   .in('to_status',['approved','adjustments'])
   .gte('created_at',sinceDate.toISOString())
   .order('created_at',{ascending:true})
   .limit(50);
  if(error)throw error;
  return Response.json({events:(data||[]).map(event=>({id:event.id,demandId:event.demand_id,status:event.to_status,createdAt:event.created_at,title:event.demand?.title||'Arte',clientName:event.demand?.clients?.name||'Cliente'}))},{headers});
 }catch(error){
  if(!error.status)console.error('AVESSO notification poll failed',{code:error.code||error.name});
  return Response.json({error:error.status?error.message:'Não foi possível carregar as notificações.'},{status:error.status||500,headers});
 }
}
