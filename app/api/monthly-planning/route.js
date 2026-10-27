import {authenticate,adminDb} from '../../../lib/r2-server';
import {fail} from '../../../lib/upload-policy.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0'};
const reply=(body,status=200)=>Response.json(body,{status,headers});
const checked=result=>{if(result.error)throw result.error;return result.data};
const cleanText=(value,max,label,required=false)=>{
  if(typeof value!=='string')fail(`${label} inválido.`);
  const clean=value.trim();
  if(clean.length>max||(required&&!clean))fail(`${label} deve conter até ${max} caracteres.`);
  return clean;
};
const validMonth=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}$/.test(value))fail('Mês inválido.');
  const [year,month]=value.split('-').map(Number);
  if(month<1||month>12||year<2000||year>2100)fail('Mês inválido.');
  return `${value}-01`;
};
const monthFromDate=value=>String(value||'').slice(0,7);
const snapshotOf=item=>({title:item.title,description:item.description,format:item.format||null,designer_id:item.designer_id||null,videomaker_id:item.videomaker_id||null});

async function agencyForClient(request,clientId){
  if(typeof clientId!=='string')fail('Cliente inválido.');
  const {db,user}=await authenticate(request),admin=adminDb();
  const client=checked(await admin.from('clients').select('id,name,organization_id').eq('id',clientId).maybeSingle());
  if(!client)fail('Cliente indisponível.',404);
  const members=checked(await db.from('organization_members').select('role').eq('organization_id',client.organization_id).eq('user_id',user.id).eq('is_active',true));
  if(!members?.some(member=>member.role&&member.role!=='client_user'))fail('Sem acesso a este cliente.',403);
  return {db,user,admin,client};
}
async function getPlan(admin,client,planId){
  const q=admin.from('client_monthly_plans').select('*').eq('client_id',client.id).eq('organization_id',client.organization_id);
  const plan=checked(await q.eq('id',planId).maybeSingle());
  if(!plan)fail('Planejamento indisponível.',404);
  return plan;
}
async function logEvents(admin,plan,items,event,actorName,note=''){
  if(!items.length)return;
  const rows=items.map(item=>({plan_id:plan.id,item_id:item.id,organization_id:plan.organization_id,client_id:plan.client_id,actor_type:'agency',event,actor_name:actorName,note,snapshot:snapshotOf(item)}));
  checked(await admin.from('client_monthly_plan_item_events').insert(rows));
}

export async function POST(request){
  try{
    const raw=await request.text();
    if(raw.length>120000)fail('Solicitação muito grande.',413);
    let body;try{body=JSON.parse(raw)}catch{fail('Solicitação inválida.')}
    const {admin,user,client}=await agencyForClient(request,body.clientId);
    const actorName=(user.email||'Equipe Avesso').slice(0,160);
    if(body.action==='listPlans'){
      const plans=checked(await admin.from('client_monthly_plans').select('id,plan_month,approval_deadline,status,updated_at,shared_at').eq('client_id',client.id).eq('organization_id',client.organization_id).order('plan_month',{ascending:false}));
      const ids=plans.map(plan=>plan.id);
      const items=ids.length?checked(await admin.from('client_monthly_plan_items').select('plan_id,status').in('plan_id',ids).is('removed_at',null)):[];
      const counts=new Map();
      for(const item of items){const count=counts.get(item.plan_id)||{total:0,pending:0,approved:0,changes:0};count.total++;if(item.status==='pending')count.pending++;if(item.status==='approved')count.approved++;if(item.status==='changes_requested')count.changes++;counts.set(item.plan_id,count)}
      return reply({plans:plans.map(plan=>({...plan,ideaCounts:counts.get(plan.id)||{total:0,pending:0,approved:0,changes:0}}))});
    }
    if(body.action==='load'){
      const plan=checked(await admin.from('client_monthly_plans').select('*').eq('client_id',client.id).eq('organization_id',client.organization_id).eq('plan_month',validMonth(body.month)).maybeSingle());
      if(!plan)return reply({plan:null,items:[],events:[]});
      const items=checked(await admin.from('client_monthly_plan_items').select('*').eq('plan_id',plan.id).is('removed_at',null).order('position',{ascending:true}).order('created_at',{ascending:true}));
      const events=checked(await admin.from('client_monthly_plan_item_events').select('id,item_id,event,actor_type,actor_name,note,snapshot,created_at').eq('plan_id',plan.id).order('created_at',{ascending:false}).limit(250));
      return reply({plan,items,events});
    }
    if(body.action==='create'){
      const planMonth=validMonth(body.month);
      const existing=checked(await admin.from('client_monthly_plans').select('*').eq('client_id',client.id).eq('plan_month',planMonth).maybeSingle());
      if(existing)return reply({plan:existing,created:false});
      const plan=checked(await admin.from('client_monthly_plans').insert({client_id:client.id,organization_id:client.organization_id,plan_month:planMonth,status:'draft'}).select('*').single());
      return reply({plan,created:true});
    }
    const plan=await getPlan(admin,client,body.planId);
    if(body.action==='deletePlan'){
      checked(await admin.from('client_monthly_plans').delete().eq('id',plan.id).eq('client_id',client.id).eq('organization_id',client.organization_id));
      return reply({deleted:true});
    }
    if(body.action==='saveApprovalDeadline'){
       const deadline=body.approvalDeadline;
       if(deadline!==null&&deadline!==undefined&&(typeof deadline!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(deadline)||!Number.isFinite(Date.parse(deadline+'T00:00:00.000Z'))||new Date(deadline+'T00:00:00.000Z').toISOString().slice(0,10)!==deadline))fail('Data prevista para aprovação inválida.');
       const updated=checked(await admin.from('client_monthly_plans').update({approval_deadline:deadline||null,updated_at:new Date().toISOString()}).eq('id',plan.id).eq('client_id',client.id).eq('organization_id',client.organization_id).select('*').single());
       return reply({plan:updated});
     }
     if(body.action==='updateMonth'){
      const newMonth=validMonth(body.newMonth);
      if(monthFromDate(newMonth)===monthFromDate(plan.plan_month))return reply({plan,changed:false});
      const conflict=checked(await admin.from('client_monthly_plans').select('id').eq('client_id',client.id).eq('plan_month',newMonth).neq('id',plan.id).maybeSingle());
      if(conflict)fail('Já existe um planejamento para o mês escolhido.',409);
      const updated=checked(await admin.from('client_monthly_plans').update({plan_month:newMonth,updated_at:new Date().toISOString()}).eq('id',plan.id).eq('client_id',client.id).eq('organization_id',client.organization_id).select('*').single());
      return reply({plan:updated,changed:true});
    }
    if(body.action==='saveItem'){
      if(body.itemId&&typeof body.itemId!=='string')fail('Item inválido.');
      const title=cleanText(body.title,200,'O título',true),description=cleanText(body.description||'',20000,'A descrição');
      const format=body.format?cleanText(body.format,80,'O formato'):null;
      const designerId=body.designerId||null,videomakerId=body.videomakerId||null;
      if(designerId!==null&&typeof designerId!=='string')fail('Designer inválido.');
      if(videomakerId!==null&&typeof videomakerId!=='string')fail('Videomaker inválido.');
      const assignments=[];if(designerId)assignments.push({id:designerId,role:'designer',label:'Designer'});if(videomakerId)assignments.push({id:videomakerId,role:'videomaker',label:'Videomaker'});
      if(assignments.length){const ids=assignments.map(person=>person.id);const team=checked(await admin.from('agency_team_members').select('id,role').eq('organization_id',client.organization_id).in('id',ids));for(const person of assignments)if(!team.some(member=>member.id===person.id&&member.role===person.role))fail(`${person.label} indisponível nesta organização.`,403)}
      const scheduledDate=null;
      if(scheduledDate&&!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate))fail('Data inválida.');
      let old=null;
      if(body.itemId){old=checked(await admin.from('client_monthly_plan_items').select('*').eq('id',body.itemId).eq('plan_id',plan.id).eq('client_id',client.id).is('removed_at',null).maybeSingle());if(!old)fail('Arte indisponível.',404)}
      const changed=!old||old.title!==title||old.description!==description||old.format!==(format||null)||old.designer_id!==(designerId||null)||old.videomaker_id!==(videomakerId||null);
      const status=!old?(plan.status==='shared'?'pending':'draft'):changed&&plan.status==='shared'?'pending':old.status;
      const reviewNote=changed&&plan.status==='shared'?null:old?.review_note||null;
      const row={plan_id:plan.id,organization_id:client.organization_id,client_id:client.id,title,description,format,scheduled_date:scheduledDate,designer_id:designerId,videomaker_id:videomakerId,position:old?.position??(Number(body.position)||0),status,review_note:reviewNote,responded_at:changed&&plan.status==='shared'?null:old?.responded_at||null,updated_at:new Date().toISOString()};
      const saved=checked(old?await admin.from('client_monthly_plan_items').update(row).eq('id',old.id).select('*').single():await admin.from('client_monthly_plan_items').insert(row).select('*').single());
      await logEvents(admin,plan,[saved],old?'edited':'created',actorName,old&&changed&&old.status==='changes_requested'?'A equipe atualizou a arte após o pedido de ajuste.':'');
      return reply({item:saved});
    }
    if(body.action==='removeItem'){
      if(typeof body.itemId!=='string')fail('Arte inválida.');
      const old=checked(await admin.from('client_monthly_plan_items').select('*').eq('id',body.itemId).eq('plan_id',plan.id).eq('client_id',client.id).is('removed_at',null).maybeSingle());
      if(!old)fail('Arte indisponível.',404);
      const removed=checked(await admin.from('client_monthly_plan_items').update({removed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',old.id).select('*').single());
      await logEvents(admin,plan,[removed],'removed',actorName);
      return reply({removed:true});
    }
    if(body.action==='share'){
      if(plan.status==='shared')fail('Este planejamento já foi compartilhado.',409);
      const items=checked(await admin.from('client_monthly_plan_items').select('*').eq('plan_id',plan.id).is('removed_at',null).order('position',{ascending:true}));
      if(!items.length)fail('Adicione pelo menos uma arte antes de compartilhar.');
       if(!plan.approval_deadline)fail('Defina a data prevista para aprovação antes de compartilhar o planejamento.');
      const updatedPlan=checked(await admin.from('client_monthly_plans').update({status:'shared',shared_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',plan.id).eq('status','draft').select('*').single());
      const updatedItems=checked(await admin.from('client_monthly_plan_items').update({status:'pending',review_note:null,responded_at:null,updated_at:new Date().toISOString()}).eq('plan_id',plan.id).eq('status','draft').is('removed_at',null).select('*'));
      await logEvents(admin,updatedPlan,updatedItems,'shared',actorName);
      return reply({plan:updatedPlan,items:updatedItems});
    }
    if(body.action==='resend'){
      if(plan.status!=='shared')fail('Compartilhe o planejamento antes de reenviar.',409);
      const items=checked(await admin.from('client_monthly_plan_items').select('*').eq('plan_id',plan.id).eq('status','changes_requested').is('removed_at',null));
      if(!items.length)fail('Não há artes com ajustes solicitados para reenviar.');
      const updated=checked(await admin.from('client_monthly_plan_items').update({status:'pending',review_note:null,responded_at:null,updated_at:new Date().toISOString()}).in('id',items.map(item=>item.id)).select('*'));
      await logEvents(admin,plan,updated,'resent',actorName,'Nova versão enviada para avaliação.');
      return reply({items:updated});
    }
    fail('Operação inválida.');
  }catch(error){
    if(!error.status)console.error('AVESSO monthly planning update failed',{code:error.code||error.name});
    return reply({error:error.status?error.message:'Não foi possível atualizar o planejamento.'},error.status||400);
  }
}
