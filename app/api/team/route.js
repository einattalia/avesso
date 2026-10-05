import {authenticate,adminDb,contractAccess} from '../../../lib/r2-server';
import {fail} from '../../../lib/upload-policy.mjs';
import {normalizeContractItems} from '../../../lib/contract-items.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
async function organizationAccess(db,user,id) {
  const {data,error}=await db.from('organization_members').select('role').eq('organization_id',id).eq('user_id',user.id).eq('is_active',true);
  if(error||!data?.some(m=>m.role&&m.role!=='client_user'))fail('Sem acesso à equipe desta organização.',403);
}
export async function POST(request) {
  try {
    const {db,user}=await authenticate(request);
    if(!process.env.SUPABASE_SERVICE_ROLE_KEY)fail('A equipe ainda não foi configurada.',503);
    const raw=await request.text();if(raw.length>32768)fail('Solicitação muito grande.',413);
    let b;try{b=JSON.parse(raw)}catch{fail('Solicitação inválida.')}
    if(!b||typeof b!=='object')fail('Solicitação inválida.');
    const admin=adminDb();
    if(['contractList','assign','mergeArts'].includes(b.action)) {
      const {d:c}=await contractAccess(db,user,b.contractId);
      const {data:items,error}=await db.from('contract_items').select('*').eq('contract_id',c.id);
      if(error)throw error;
      const {data:team,error:te}=await admin.from('agency_team_members').select('*').eq('organization_id',c.organization_id).order('name');
      if(te)throw te;
      if(b.action==='contractList') {
        const {data:assignments,error:ae}=await admin.from('contract_item_assignments').select('contract_item_id,team_member_ids').eq('contract_id',c.id);
        if(ae)throw ae;
        return Response.json({team:team||[],assignments:assignments||[]},{headers});
      }
      if(b.action==='assign') {
        if(!Array.isArray(b.itemIds)||!b.itemIds.length||b.itemIds.length>100||!Array.isArray(b.memberIds)||b.memberIds.length>100)fail('Seleção de responsáveis inválida.');
        const itemIds=[...new Set(b.itemIds)],memberIds=[...new Set(b.memberIds)];
        if(itemIds.some(id=>!items.some(i=>i.id===id&&!i.merged_into)))fail('Entrega indisponível neste contrato.',403);
        if(memberIds.some(id=>!team.some(m=>m.id===id)))fail('Responsável indisponível nesta organização.',403);
        const rows=itemIds.map(id=>({contract_item_id:id,contract_id:c.id,team_member_ids:memberIds,updated_by:user.id,updated_at:new Date().toISOString()}));
        const {error}=await admin.from('contract_item_assignments').upsert(rows,{onConflict:'contract_item_id'});
        if(error)throw error;
        return Response.json({saved:true},{headers});
      }
      const arts=normalizeContractItems(items).find(i=>i._isArts);
      if(!arts||arts.id!==b.itemId)fail('A linha de Artes mudou. Atualize o contrato antes de salvar.',409);
      if(b.quantity!==null&&(!Number.isSafeInteger(b.quantity)||b.quantity<0))fail('A quantidade de artes deve ser um número inteiro positivo ou zero.');
      if(b.extraValue!==null&&(!Number.isFinite(b.extraValue)||b.extraValue<0))fail('Valor extra inválido.');
      if(typeof b.active!=='boolean')fail('Status da entrega inválido.');
      const {data,error:re}=await admin.rpc('avesso_merge_contract_arts',{target_contract:c.id,actor_id:user.id,art_ids:arts._sourceIds,main_id:arts.id,quantity:b.quantity,extra_price:b.extraValue,active:b.active});
      if(re)throw re;
      return Response.json({saved:true,itemId:data},{headers});
    }
    await organizationAccess(db,user,b.organizationId);
    if(b.action==='list') {
      const {data,error}=await admin.from('agency_team_members').select('*').eq('organization_id',b.organizationId).order('name');
      if(error)throw error;return Response.json({team:data||[]},{headers});
    }
    if(['create','update'].includes(b.action)) {
      if(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>120||!['designer','videomaker'].includes(b.role))fail('Preencha o nome e selecione Designer ou Videomaker.');
      if(b.action==='create') {
        const {error}=await admin.from('agency_team_members').insert({organization_id:b.organizationId,name:b.name.trim(),role:b.role,is_active:true});
        if(error)throw error;
      }else {
        if(typeof b.active!=='boolean')fail('Status da pessoa inválido.');
        const {data,error}=await admin.from('agency_team_members').update({name:b.name.trim(),role:b.role,is_active:b.active}).eq('id',b.memberId).eq('organization_id',b.organizationId).select('id').maybeSingle();
        if(error)throw error;if(!data)fail('Pessoa indisponível.',404);
      }
      return Response.json({saved:true},{headers});
    }
    fail('Operação inválida.');
  }catch(e){if(!e.status)console.error('AVESSO team operation failed',e.code||e.name);return Response.json({error:e.status?e.message:'Não foi possível salvar. Confira se o SQL de contratos e equipe foi executado e tente novamente.'},{status:e.status||500,headers})}
}
