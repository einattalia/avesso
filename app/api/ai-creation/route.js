import {authenticate,briefingAccess} from '../../../lib/r2-server';
import {fail} from '../../../lib/upload-policy.mjs';
import {creationPrompt,responseText} from '../../../lib/ai-creation.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store'};
const checked=r=>{if(r.error)throw r.error;return r.data};
const active=new Map();
export async function POST(request){
 let lock;
 try{
  const {db,user}=await authenticate(request);
  const raw=await request.text();if(raw.length>32000)fail('O briefing ultrapassou o limite.',413);
  let b;try{b=JSON.parse(raw)}catch{fail('Pedido inválido.')}
  if(!b||typeof b.clientId!=='string')fail('Selecione um cliente.');
  const {d}=await briefingAccess(db,user,b.clientId);
  if(b.action==='status')return Response.json({configured:!!process.env.OPENAI_API_KEY},{headers});
  if(b.action!=='generate')fail('Operação inválida.');
  if(!process.env.OPENAI_API_KEY)fail('A geração com IA ainda não foi ativada. Você pode preparar e copiar o briefing enquanto a conexão é configurada.',503);
  const fields={};for(const [key,max] of Object.entries({tool:20,topic:12000,objective:1000,audience:1000,tone:500,quantity:500,month:30})){if(b[key]!=null&&typeof b[key]!=='string')fail('Briefing inválido.');fields[key]=(b[key]||'').trim();if(fields[key].length>max)fail('Um dos campos ultrapassou o limite.');}
  if(!fields.topic)fail('Descreva o que deseja criar.');
  // Bound concurrent requests per user in this server instance; provider limits remain separate.
  if(active.has(user.id))fail('Uma criação está em andamento. Aguarde antes de gerar novamente.',429);lock=user.id;active.set(lock,true);
  const client=checked(await db.from('clients').select('name').eq('id',d.client_id).single());
  const materials=checked(await db.from('client_materials').select('title,body,category').eq('client_id',d.client_id).eq('section','branding').order('updated_at',{ascending:false}).limit(12));
  const context=(materials||[]).map(m=>`${m.title}\n${m.body||''}`).join('\n\n').slice(0,12000);
  const input=creationPrompt({...fields,clientName:client.name,context});
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_TEXT_MODEL||'gpt-6-luna',input,store:false,max_output_tokens:4000}),signal:AbortSignal.timeout(50000)});
  if(!response.ok){if(response.status===429)fail('O limite ou saldo da IA foi atingido. Confira a conta da API antes de tentar novamente.',429);fail('Não foi possível gerar agora. Confira a configuração da IA e tente novamente.',502);}
  const data=await response.json();return Response.json({text:responseText(data),usage:data.usage?{input_tokens:data.usage.input_tokens,output_tokens:data.usage.output_tokens}:null},{headers});
 }catch(e){return Response.json({error:e.status?e.message:e.name==='TimeoutError'?'A geração demorou mais do que o esperado. Tente um pedido menor.':'Não foi possível concluir a criação.'},{status:e.status||500,headers});}
 finally{if(lock)active.delete(lock)}
}
