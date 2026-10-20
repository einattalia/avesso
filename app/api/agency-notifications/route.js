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
  let clientId=params.get('clientId');
  if(!/^[0-9a-f-]{36}$/i.test(organizationId||''))fail('Organização inválida.');
  const membersResult=await db.from('organization_members').select('role').eq('organization_id',organizationId).eq('user_id',user.id).eq('is_active',true);
  const members=membersResult.data||[];
  if(membersResult.error||!members.length)fail('Sem acesso às notificações desta organização.',403);
  const isClient=members.every(member=>member.role==='client_user');
  if(isClient){
   const {data:links,error:linkError}=await db.from('client_users').select('clients(id,organization_id)').eq('user_id',user.id);
   const ownClientIds=[...new Set((links||[]).map(link=>link.clients).filter(client=>client?.organization_id===organizationId).map(client=>client.id))];
   if(linkError||!ownClientIds.length)fail('Cliente não vinculado a esta organização.',403);
   if(clientId&&!ownClientIds.includes(clientId))fail('Sem acesso às notificações deste cliente.',403);
   clientId=clientId||ownClientIds[0];
  }
  if(clientId&&!/^[0-9a-f-]{36}$/i.test(clientId))fail('Cliente inválido.');
  const since=params.get('since');
  const sinceDate=since?new Date(since):new Date(Date.now()-90*86400000);
  if(Number.isNaN(sinceDate.getTime()))fail('Período inválido.');
  const query=adminDb().from('production_activity')
   .select('id,demand_id,to_status,created_at,demand:demands!inner(title,organization_id,clients(name))')
   .eq('demand.organization_id',organizationId)
   .in('to_status',['with_client','approved','adjustments'])
   .gte('created_at',sinceDate.toISOString());
  if(clientId)query.eq('demand.client_id',clientId);
  const {data,error}=await query.order('created_at',{ascending:false}).limit(50);
  if(error)throw error;
  return Response.json({events:(data||[]).map(event=>({id:event.id,demandId:event.demand_id,status:event.to_status,createdAt:event.created_at,title:event.demand?.title||'Arte',clientName:event.demand?.clients?.name||'Cliente'}))},{headers});
 }catch(error){
  if(!error.status)console.error('AVESSO notification poll failed',{code:error.code||error.name});
  return Response.json({error:error.status?error.message:'Não foi possível carregar as notificações.'},{status:error.status||500,headers});
 }
}
