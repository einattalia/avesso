import {authenticate,adminDb} from '../../../lib/r2-server';
import {fail} from '../../../lib/upload-policy.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0'};
const reply=(body,status=200)=>Response.json(body,{status,headers});
const checked=result=>{if(result.error)throw result.error;return result.data};
const monthOnly=report=>({...report,period:String(report.period).slice(0,7)});
const defaultBranding={primary_color:'#ffc928',secondary_color:'#f18523'};
const validColor=value=>typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value)?value.toLowerCase():null;
const fieldLimits={followers_before:40,followers_after:40,publications:40,reach:40,views:40,interactions:40,clicks:40,new_audience:40,stories_views:40,reels_views:40,posts_views:40,summary:1200,analysis:2400,plan:1600,team_names:700,rating:40};
function validPeriod(value){if(typeof value!=='string'||!/^(?:20\d{2}|2100)-(?:0[1-9]|1[0-2])$/.test(value))fail('Mês do relatório inválido.');return `${value}-01`}
function cleanPayload(value){if(!value||typeof value!=='object'||Array.isArray(value))fail('Dados do relatório inválidos.');const payload={};for(const [key,max] of Object.entries(fieldLimits)){const field=value[key]??'';if(typeof field!=='string'&&typeof field!=='number')fail(`Campo ${key} inválido.`);const text=String(field).trim();if(text.length>max)fail(`Um dos campos ultrapassou o limite permitido.`);payload[key]=text}return payload}
async function resolveAccess(request,clientId){
 if(typeof clientId!=='string'||clientId.length>64)fail('Cliente inválido.');
 const {db,user}=await authenticate(request),admin=adminDb();
 const client=checked(await admin.from('clients').select('id,name,organization_id').eq('id',clientId).maybeSingle());
 if(!client)fail('Cliente indisponível.',404);
 const members=checked(await db.from('organization_members').select('role').eq('organization_id',client.organization_id).eq('user_id',user.id).eq('is_active',true));
 const agency=members?.some(member=>member.role&&member.role!=='client_user')||false;
 if(!agency){
  if(!members?.some(member=>member.role==='client_user'))fail('Sem acesso a este cliente.',403);
  const links=checked(await db.from('client_users').select('client_id').eq('client_id',client.id).eq('user_id',user.id));
  if(!links?.length)fail('Sem acesso a este cliente.',403);
 }
 return {db,admin,user,client,agency};
}
async function signedLogo(admin,path){if(!path)return null;try{const result=await admin.storage.from('avesso-profile-images').createSignedUrl(path,3600);return result.data?.signedUrl||null}catch{return null}}

export async function POST(request){
 try{
  const raw=await request.text();if(raw.length>30000)fail('Solicitação muito grande.',413);
  let body;try{body=JSON.parse(raw)}catch{fail('Solicitação inválida.')}
  if(!body||typeof body!=='object'||typeof body.clientId!=='string'||!['list','save','publish','unpublish','save-branding'].includes(body.action))fail('Operação inválida.');
  const {admin,user,client,agency}=await resolveAccess(request,body.clientId);
  if(body.action==='list'){
   let query=admin.from('client_reports').select('id,client_id,organization_id,period,payload,status,published_at,created_at,updated_at').eq('client_id',client.id).eq('organization_id',client.organization_id).order('period',{ascending:false});
   if(!agency)query=query.eq('status','published');
   const reports=checked(await query);
   const savedBranding=checked(await admin.from('client_report_branding').select('logo_path,primary_color,secondary_color').eq('client_id',client.id).eq('organization_id',client.organization_id).maybeSingle());
   const branding={logoPath:savedBranding?.logo_path||'',primaryColor:savedBranding?.primary_color||defaultBranding.primary_color,secondaryColor:savedBranding?.secondary_color||defaultBranding.secondary_color};
   return reply({reports:(reports||[]).map(monthOnly),client:{id:client.id,name:client.name},branding,clientLogoUrl:await signedLogo(admin,branding.logoPath)});
  }
  if(!agency)fail('Somente a equipe da agência pode editar relatórios.',403);
  if(body.action==='save-branding'){
   const input=body.branding||{};
   const primaryColor=validColor(input.primaryColor),secondaryColor=validColor(input.secondaryColor);
   if(!primaryColor||!secondaryColor)fail('Escolha cores válidas para o relatório.');
   const logoPath=typeof input.logoPath==='string'?input.logoPath.trim():'';
   const logoPrefix=`${client.organization_id}/client-report-logo/${client.id}/`;
   if(logoPath&&(logoPath.length>1024||!logoPath.startsWith(logoPrefix)||logoPath.includes('..')))fail('A logo selecionada não pertence a este cliente.');
   const branding=checked(await admin.from('client_report_branding').upsert({client_id:client.id,organization_id:client.organization_id,logo_path:logoPath||null,primary_color:primaryColor,secondary_color:secondaryColor,updated_at:new Date().toISOString(),updated_by:user.id},{onConflict:'client_id'}).select('logo_path,primary_color,secondary_color').single());
   return reply({branding:{logoPath:branding.logo_path||'',primaryColor:branding.primary_color,secondaryColor:branding.secondary_color},clientLogoUrl:await signedLogo(admin,branding.logo_path)});
  }
  if(body.action==='save'){
   const period=validPeriod(body.period),payload=cleanPayload(body.payload);
   let existing=checked(await admin.from('client_reports').select('id,created_by').eq('client_id',client.id).eq('organization_id',client.organization_id).eq('period',period).maybeSingle());
   if(existing&&!body.reportId)fail('Já existe um relatório para esse mês. Atualize a página e selecione-o antes de editar.',409);
   if(body.reportId&&(!existing||existing.id!==body.reportId))fail('O relatório mudou. Atualize a página antes de salvar novamente.',409);
   const row={client_id:client.id,organization_id:client.organization_id,period,payload,status:'draft',published_at:null,updated_at:new Date().toISOString(),updated_by:user.id};
   if(existing)row.id=existing.id;else row.created_by=user.id;
   const report=checked(await admin.from('client_reports').upsert(row,{onConflict:'client_id,period'}).select('id,client_id,organization_id,period,payload,status,published_at,created_at,updated_at').single());
   return reply({report});
  }
  if(typeof body.reportId!=='string'||body.reportId.length>64)fail('Relatório inválido.');
  const report=checked(await admin.from('client_reports').select('id,period,payload,status').eq('id',body.reportId).eq('client_id',client.id).eq('organization_id',client.organization_id).maybeSingle());
  if(!report)fail('Relatório indisponível.',404);
  if(body.action==='publish'){
   const hasMetric=['followers_after','reach','views','interactions','publications'].some(key=>String(report.payload?.[key]||'').trim());
   if(!hasMetric&&!String(report.payload?.summary||'').trim()&&!String(report.payload?.analysis||'').trim())fail('Preencha ao menos um indicador ou uma análise antes de publicar.');
   const updated=checked(await admin.from('client_reports').update({status:'published',published_at:new Date().toISOString(),updated_at:new Date().toISOString(),updated_by:user.id}).eq('id',report.id).eq('client_id',client.id).eq('organization_id',client.organization_id).select('id,period,status,published_at,updated_at').single());
   return reply({report:monthOnly(updated)});
  }
  const updated=checked(await admin.from('client_reports').update({status:'draft',published_at:null,updated_at:new Date().toISOString(),updated_by:user.id}).eq('id',report.id).eq('client_id',client.id).eq('organization_id',client.organization_id).select('id,period,status,published_at,updated_at').single());
  return reply({report:monthOnly(updated)});
 }catch(error){
  if(!error.status)console.error('AVESSO client report operation failed',{code:error.code||error.name});
  return reply({error:error.status?error.message:'Não foi possível concluir esta ação.'},error.status||400);
 }
}
