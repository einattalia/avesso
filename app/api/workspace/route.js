import {authenticate,adminDb,config,demandAccess} from '../../../lib/r2-server';
import {PutObjectCommand,GetObjectCommand,HeadObjectCommand,CopyObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {randomUUID} from 'node:crypto';
import {fail} from '../../../lib/upload-policy.mjs';
import {safeLink,textValue,eventPayload} from '../../../lib/workspace-policy.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
const checked=r=>{if(r.error)throw r.error;return r.data};
async function access(db,user,clientId,orgId){
 let client=null;
 if(clientId){client=checked(await db.from('clients').select('id,name,organization_id').eq('id',clientId).maybeSingle());if(!client)fail('Cliente indisponível.',404);orgId=client.organization_id;}
 const members=checked(await db.from('organization_members').select('role').eq('organization_id',orgId).eq('user_id',user.id).eq('is_active',true));
 const agency=members?.some(m=>m.role!=='client_user');
 if(!agency){if(!client||!members?.some(m=>m.role==='client_user'))fail('Sem acesso.',403);const links=checked(await db.from('client_users').select('id').eq('client_id',clientId).eq('user_id',user.id));if(!links?.length)fail('Sem acesso.',403);}
 return {client,orgId,agency};
}
export async function POST(request){try{
 const {db,user}=await authenticate(request);const raw=await request.text();if(raw.length>150000)fail('Solicitação muito grande.',413);const b=JSON.parse(raw);
 const {client,orgId,agency}=await access(db,user,b.clientId,b.organizationId);const admin=adminDb();
 const staff=()=>{if(!agency)fail('Ação disponível para a equipe.',403)};
 if(b.action==='contents'){
  let q=admin.from('demands').select('id,client_id,organization_id,project_id,title,type,status,due_date,publish_date,approved_at,created_at,reference_id,'+(agency?'briefing,notes,responsible_name,':'')+'clients(name),demand_versions(id,demand_id,version_number,status,file_name,mime_type,file_size,caption,created_at)').eq('organization_id',orgId).order('created_at',{ascending:false});
  if(client)q=q.eq('client_id',client.id);
  const rows=checked(await q);
  let projectsQuery=admin.from('production_projects').select('id,client_id,title,description').eq('organization_id',orgId).is('archived_at',null);
  if(client)projectsQuery=projectsQuery.eq('client_id',client.id);
  const projects=checked(await projectsQuery);
  const byId=new Map(projects.map(p=>[p.id,p]));
  return Response.json({items:rows.map(d=>({...d,project:byId.get(d.project_id)||null,demand_versions:(d.demand_versions||[]).filter(v=>agency||['sent_for_review','approved','changes_requested','delivered'].includes(v.status))})).filter(d=>agency||d.demand_versions.length),projects,agency},{headers});
 }
 if(b.action==='scheduleContent'){
  staff();const {d}=await demandAccess(db,user,b.demandId,true);if(d.organization_id!==orgId)fail('Sem acesso.',403);
  if(b.date&&!/^\d{4}-\d{2}-\d{2}$/.test(b.date))fail('Data inválida.');
  checked(await admin.from('demands').update({publish_date:b.date||null}).eq('id',d.id));return Response.json({saved:true},{headers});
 }
 if(b.action==='list'){
  let q=admin.from('client_materials').select('*').eq('client_id',client.id).eq('section',b.section).order('updated_at',{ascending:false});if(!agency)q=q.eq('shared',true);
  return Response.json({items:checked(await q).map(x=>({...x,can_edit:agency||x.author_id===user.id})),agency},{headers});
 }
 if(b.action==='save'){
  if(!['references','branding'].includes(b.section))fail('Área inválida.');if(b.section==='branding')staff();
  const body=textValue(b.body||'',100000),title=textValue(b.title||body.split('\n')[0].slice(0,80),200);if(!title||(!body&&!b.link))fail('Escreva sua ideia ou adicione um link.');
  let old=null;if(b.id){old=checked(await admin.from('client_materials').select('*').eq('id',b.id).eq('client_id',client.id).eq('section',b.section).maybeSingle());if(!old||(!agency&&(old.author_id!==user.id||!old.shared)))fail('Referência indisponível.',403);if(old.updated_at!==b.updatedAt)fail('Este texto mudou. Atualize a página antes de salvar.',409);}
  const row={client_id:client.id,section:b.section,title,body,link:safeLink(b.link||''),category:textValue(b.category||'Ideia',60),state:['Para avaliar','Selecionada','Já utilizada'].includes(b.state)?b.state:'Para avaliar',shared:agency?!!b.shared:true,author_id:old?.author_id||user.id,updated_at:new Date().toISOString()};
  const item=checked(old?await admin.from('client_materials').update(row).eq('id',old.id).eq('updated_at',b.updatedAt).select().maybeSingle():await admin.from('client_materials').insert(row).select().single());if(!item)fail('Outra pessoa editou este texto. Recarregue antes de salvar.',409);
  return Response.json({item},{headers});
 }
 if(b.action==='convert'){
  staff();const ref=checked(await admin.from('client_materials').select('*').eq('id',b.id).eq('client_id',client.id).eq('section','references').single());
  const d=checked(await admin.rpc('avesso_reference_to_content',{actor:user.id,reference:ref.id}));return Response.json({demand:d},{headers});
 }
 if(b.action==='events'){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(b.from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(b.to||''))fail('Período inválido.');
  const from=new Date(b.from+'T00:00:00-03:00'),to=new Date(b.to+'T00:00:00-03:00');if(!Number.isFinite(+from)||!Number.isFinite(+to)||to<=from||to-from>93*86400000)fail('Período inválido.');
  let q=admin.from('recording_sessions').select('*,clients(name)').eq('organization_id',orgId).lt('starts_at',to.toISOString()).gte('ends_at',from.toISOString()).order('starts_at');if(client)q=q.eq('client_id',client.id);if(!agency)q=q.eq('shared',true);
  let posts=admin.from('demands').select('id,title,client_id,publish_date,status,clients(name)').eq('organization_id',orgId).not('publish_date','is',null).gte('publish_date',b.from).lt('publish_date',b.to);if(client)posts=posts.eq('client_id',client.id);if(!agency)posts=posts.in('status',['with_client','approved','awaiting_scheduling','scheduled','posted','delivered']);
  const [events,p,team,clients]=await Promise.all([q,posts,agency?admin.from('agency_team_members').select('*').eq('organization_id',orgId).eq('is_active',true):Promise.resolve({data:[]}),agency?db.from('clients').select('id,name').eq('organization_id',orgId).order('name'):Promise.resolve({data:[client]})]);
  return Response.json({events:checked(events),posts:checked(p),team:checked(team),clients:checked(clients),agency},{headers});
 }
 if(b.action==='saveEvent'){
  staff();let e;try{e=eventPayload(b.event)}catch(err){fail(err.message)};if(!e.title)fail('Informe o título.');
  const cid=b.event.client_id||null;if(client&&cid!==client.id)fail('Cliente inválido.',403);
  const {data,error}=await admin.rpc('avesso_save_calendar_event',{actor:user.id,org:orgId,event_id:b.id||null,customer:cid,payload:e});
  if(error){
   const message=String(error.message||'');
   if(message.startsWith('Conflito:'))fail(message,409);
   if(message==='Permission denied')fail('Sua conta não tem permissão para salvar compromissos.',403);
   if(['Invalid client','Invalid team','Invalid period'].includes(message))fail('Os dados do compromisso mudaram ou estão inválidos. Atualize a agenda e tente novamente.',400);
   console.error('AVESSO calendar save failed',{code:error.code||'unknown'});
   fail('Falha ao salvar o compromisso. A agenda não foi alterada. Tente novamente; se persistir, informe o suporte.',500);
  }
  return Response.json({id:data},{headers});
 }
 // A subject is always re-authorized before reading comments or signing an attachment.
 let subject;
 if(b.subjectType==='material'){
  const item=checked(await admin.from('client_materials').select('*').eq('id',b.subjectId).eq('client_id',client.id).maybeSingle());if(!item||(!agency&&!item.shared))fail('Item indisponível.',404);subject={id:item.id};
 }else if(b.subjectType==='version'){
  const v=checked(await admin.from('demand_versions').select('*').eq('id',b.subjectId).maybeSingle());if(!v)fail('Versão indisponível.',404);const {d}=await demandAccess(db,user,v.demand_id);if(d.client_id!==client.id||(!agency&&!['sent_for_review','approved','changes_requested','delivered'].includes(v.status)))fail('Versão indisponível.',403);subject=v;
 }else fail('Operação inválida.');
 if(b.action==='materialHistory'){
  staff();if(b.subjectType!=='material')fail('Item inválido.');const history=checked(await admin.from('client_material_history').select('id,snapshot,created_at').eq('material_id',subject.id).order('created_at',{ascending:false}).limit(30));return Response.json({history},{headers});
 }
 if(b.action==='caption'){
  staff();if(b.subjectType!=='version')fail('Versão inválida.');const caption=textValue(b.body||'',20000);
  const saved=checked(await admin.from('demand_versions').update({caption}).eq('id',subject.id).eq('status','draft').select('id').maybeSingle());if(!saved)fail('A legenda só pode ser editada no rascunho. Envie uma nova versão.',409);return Response.json({saved:true},{headers});
 }
 if(b.action==='thread'){
  const [comments,assets]=await Promise.all([admin.from('client_notes').select('*').eq('subject_id',subject.id).order('created_at'),admin.from('client_assets').select('id,file_name,mime_type,file_size,created_at,author_id,purpose').eq('subject_id',subject.id).eq('ready',true).order('created_at')]);const notes=checked(comments);const decisions=b.subjectType==='version'?checked(await admin.from('approval_events').select('id,event,created_at,user_id,note').eq('demand_version_id',subject.id).order('created_at')):[];const ids=[...new Set([...notes.map(n=>n.author_id),...decisions.map(n=>n.user_id)])];const profiles=ids.length?checked(await admin.from('profiles').select('id,full_name').in('id',ids)):[];
  return Response.json({comments:notes.map(n=>({...n,author_name:profiles.find(p=>p.id===n.author_id)?.full_name||n.author_name})),assets:checked(assets),decisions:decisions.map(d=>({...d,author_name:profiles.find(p=>p.id===d.user_id)?.full_name||'Usuário'}))},{headers});
 }
 if(b.action==='comment'){
  const body=textValue(b.body||'');if(!body)fail('Escreva um comentário.');checked(await admin.from('client_notes').insert({client_id:client.id,subject_id:subject.id,subject_type:b.subjectType,body,author_id:user.id,author_name:agency?'Equipe':'Cliente'}));return Response.json({saved:true},{headers});
 }
 if(b.action==='initAsset'){
  const allowed=['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/webm','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if(!allowed.includes(b.mime)||!Number.isSafeInteger(b.size)||b.size<=0||b.size>104857600)fail('Use imagem, PDF, DOCX, ZIP ou vídeo MP4/WEBM de até 100 MB.');
  if(b.purpose==='slide'&&(!b.mime.startsWith('image/')||!agency||b.subjectType!=='version'||subject.status!=='draft'))fail('Adicione imagens apenas à versão em rascunho.',409);
  const id=randomUUID(),{s3,bucket}=config(),key=`workspace/${client.id}/${subject.id}/${id}`;
  checked(await admin.from('client_assets').insert({id,client_id:client.id,subject_id:subject.id,subject_type:b.subjectType,file_name:textValue(b.name,240),mime_type:b.mime,file_size:b.size,object_key:key,bucket,author_id:user.id,purpose:b.purpose==='slide'?'slide':'reference'}));
  const url=await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket,Key:key,ContentType:b.mime,ContentLength:b.size}),{expiresIn:900});return Response.json({id,url},{headers});
 }
 if(['finishAsset','readAsset'].includes(b.action)){
  const f=checked(await admin.from('client_assets').select('*').eq('id',b.assetId).eq('subject_id',subject.id).eq('client_id',client.id).maybeSingle());if(!f)fail('Anexo indisponível.',404);const {s3,bucket}=config();if(f.bucket!==bucket)fail('Armazenamento indisponível.',409);
  if(b.action==='finishAsset'){if(f.author_id!==user.id)fail('Envio pertence a outro usuário.',403);if(f.purpose==='slide'&&subject.status!=='draft')fail('A versão já foi enviada para aprovação.',409);const head=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:f.object_key}));if(head.ContentLength!==Number(f.file_size)||head.ContentType!==f.mime_type)fail('Arquivo incompleto.',409);if(!f.ready){const finalKey=`workspace-final/${client.id}/${f.id}/${randomUUID()}`;
  await s3.send(new CopyObjectCommand({Bucket:bucket,Key:finalKey,CopySource:encodeURIComponent(bucket+'/'+f.object_key)}));
  checked(await admin.rpc('avesso_finish_workspace_asset',{asset:f.id,actor:user.id,final_key:finalKey}));}return Response.json({saved:true},{headers});}
  if(!f.ready)fail('Anexo ainda não enviado.',409);const url=await getSignedUrl(s3,new GetObjectCommand({Bucket:bucket,Key:f.object_key,ResponseContentDisposition:`${b.preview?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(f.file_name)}`,ResponseCacheControl:'private, no-store'}),{expiresIn:900});return Response.json({url},{headers});
 }
 fail('Operação inválida.');
}catch(e){console.error('AVESSO workspace',{code:e.code||e.name});return Response.json({error:e.status?e.message:e instanceof TypeError||e.message?.includes('inválido')?e.message:'Não foi possível concluir. Confira a configuração da atualização e tente novamente.'},{status:e.status||400,headers});}}
