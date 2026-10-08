import {authenticate,adminDb} from '../../../lib/r2-server';
import {fail} from '../../../lib/upload-policy.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
const checked=r=>{if(r.error)throw r.error;return r.data};
const clean=(value,max)=>String(value??'').trim().slice(0,max);
function dateValue(value){if(!value)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(`${value}T00:00:00.000Z`).toISOString().slice(0,10)!==value)fail('Data de prazo inválida.');return value;}

export async function POST(request){
 try{
  const {db,user}=await authenticate(request);
  const raw=await request.text();if(raw.length>50000)fail('Solicitação muito grande.',413);
  let b;try{b=JSON.parse(raw)}catch{fail('Solicitação inválida.');}
  if(!b||!['list','create','update','delete','createArt','updateArt','moveArt'].includes(b.action))fail('Operação inválida.');

  let client=null,organizationId=b.organizationId;
  if(b.clientId){client=checked(await db.from('clients').select('id,organization_id').eq('id',b.clientId).maybeSingle());if(!client)fail('Cliente indisponível.',404);organizationId=client.organization_id;}
  if(!organizationId)fail('Organização inválida.');
  const members=checked(await db.from('organization_members').select('role').eq('organization_id',organizationId).eq('user_id',user.id).eq('is_active',true));
  const agency=members?.some(m=>m.role!=='client_user');
  if(!agency)fail('Somente a equipe pode organizar projetos.',403);
  const admin=adminDb();
  if(b.action==='list'){
   let q=admin.from('production_projects').select('id,organization_id,client_id,title,description,created_at,updated_at').eq('organization_id',organizationId).is('archived_at',null).order('created_at',{ascending:false});
   if(client)q=q.eq('client_id',client.id);
   return Response.json({projects:checked(await q)},{headers});
  }
  if(b.action==='create'){
   const title=clean(b.title,160);if(!title)fail('Dê um nome ao projeto.');
   const targetClient=client||checked(await db.from('clients').select('id,organization_id').eq('id',b.clientId).eq('organization_id',organizationId).maybeSingle());
   if(!targetClient)fail('Selecione um cliente válido.');
   const project=checked(await admin.from('production_projects').insert({organization_id:organizationId,client_id:targetClient.id,title,description:clean(b.description,10000),created_by:user.id}).select('id,organization_id,client_id,title,description,created_at,updated_at').single());
   return Response.json({project},{status:201,headers});
  }
  const projectId=b.projectId;
  if(!projectId)fail('Projeto inválido.');
  const project=checked(await admin.from('production_projects').select('id,organization_id,client_id').eq('id',projectId).eq('organization_id',organizationId).maybeSingle());
  if(!project||client&&project.client_id!==client.id)fail('Projeto indisponível.',404);
  if(b.action==='update'){
   const title=clean(b.title,160);if(!title)fail('Dê um nome ao projeto.');
   const saved=checked(await admin.from('production_projects').update({title,description:clean(b.description,10000),updated_at:new Date().toISOString()}).eq('id',projectId).select('id,organization_id,client_id,title,description,created_at,updated_at').single());
   return Response.json({project:saved},{headers});
  }
  if(b.action==='delete'){
   // Preserve the artwork and its files when its containing project is removed.
   checked(await admin.from('demands').update({project_id:null}).eq('project_id',projectId).eq('organization_id',organizationId));
   checked(await admin.from('production_projects').delete().eq('id',projectId).eq('organization_id',organizationId));
   return Response.json({deleted:true},{headers});
  }
  if(b.action==='moveArt'){
   if(!b.demandId)fail('Arte inválida.');
   const art=checked(await admin.from('demands').select('id,client_id,project_id').eq('id',b.demandId).eq('organization_id',organizationId).maybeSingle());
   if(!art||client&&art.client_id!==client.id)fail('Arte indisponível.',404);
   if(art.client_id!==project.client_id)fail('A arte só pode ser movida para um projeto do mesmo cliente.',403);
   checked(await admin.from('demands').update({project_id:project.id}).eq('id',art.id).eq('organization_id',organizationId));
   return Response.json({moved:true},{headers});
  }
  if(b.action==='createArt'){
   const title=clean(b.title,200);if(!title)fail('Dê um nome para esta arte.');
   const row=checked(await admin.from('demands').insert({organization_id:project.organization_id,client_id:project.client_id,project_id:project.id,title,type:clean(b.type,80)||'Criativo estático',briefing:clean(b.briefing,20000)||null,notes:clean(b.notes,20000)||null,responsible_name:clean(b.responsibleName,160)||null,due_date:dateValue(b.dueDate),status:'in_production'}).select('id,project_id,title').single());
   return Response.json({art:row},{status:201,headers});
  }
  if(b.action==='updateArt'){
   if(!b.demandId)fail('Arte inválida.');
   const title=clean(b.title,200);if(!title)fail('Dê um nome para esta arte.');
   const row=checked(await admin.from('demands').update({title,type:clean(b.type,80)||'Criativo estático',briefing:clean(b.briefing,20000)||null,notes:clean(b.notes,20000)||null,responsible_name:clean(b.responsibleName,160)||null,due_date:dateValue(b.dueDate)}).eq('id',b.demandId).eq('project_id',project.id).select('id,project_id,title,type,briefing,notes,responsible_name,due_date').maybeSingle());
   if(!row)fail('Arte indisponível.',404);
   return Response.json({art:row},{headers});
  }
 }catch(e){
  if(!e.status)console.error('AVESSO project operation failed',{code:e.code||e.name});
  return Response.json({error:e.status?e.message:'Não foi possível concluir esta ação.'},{status:e.status||500,headers});
 }
}
