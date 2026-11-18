import {authenticate,adminDb} from '../../../lib/r2-server';
import {createInstagramState} from '../../../lib/instagram-connect.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
const json=(body,status=200)=>Response.json(body,{status,headers});
function checked(result){if(result.error)throw result.error;return result.data}
async function agencyClient(db,user,clientId){
 if(typeof clientId!=='string'||clientId.length>80)throw Object.assign(new Error('Cliente inválido.'),{status:400});
 const client=checked(await db.from('clients').select('id,organization_id').eq('id',clientId).maybeSingle());
 if(!client)throw Object.assign(new Error('Cliente indisponível.'),{status:404});
 const members=checked(await db.from('organization_members').select('role').eq('organization_id',client.organization_id).eq('user_id',user.id).eq('is_active',true));
 if(!members?.some(m=>m.role&&m.role!=='client_user'))throw Object.assign(new Error('Somente a equipe da agência pode conectar o Instagram.'),{status:403});
 return client;
}
function errorResponse(error){return json({error:error.status?error.message:'Não foi possível concluir a conexão com o Instagram.'},error.status||500)}
export async function GET(request){
 try{
  const {db,user}=await authenticate(request),url=new URL(request.url),client=await agencyClient(db,user,url.searchParams.get('clientId'));
  const row=checked(await adminDb().from('client_instagram_connections').select('username,account_type,token_expires_at,updated_at').eq('client_id',client.id).maybeSingle());
  return json({connected:!!row,connection:row||null});
 }catch(error){return errorResponse(error)}
}
export async function POST(request){
 try{
  const {db,user}=await authenticate(request),body=await request.json(),client=await agencyClient(db,user,body.clientId);
  if(body.action!=='connect')return json({error:'Operação inválida.'},400);
  const appId=process.env.META_INSTAGRAM_APP_ID,configId=process.env.META_INSTAGRAM_CONFIG_ID,secret=process.env.META_INSTAGRAM_APP_SECRET,stateSecret=process.env.INSTAGRAM_STATE_SECRET,appUrl=process.env.APP_URL;
  if(!appId||!configId||!secret||!stateSecret||!appUrl||!process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY)return json({error:'Conexão ainda não configurada. Cadastre as credenciais do aplicativo da Meta, o ID da configuração de login e as chaves de proteção no Vercel.'},503);
  let base;try{base=new URL(appUrl)}catch{return json({error:'APP_URL inválida.'},503)}
  if(!['https:','http:'].includes(base.protocol)||(base.protocol==='http:'&&!['localhost','127.0.0.1'].includes(base.hostname)))return json({error:'APP_URL precisa usar HTTPS.'},503);
  const redirectUri=new URL('/api/instagram/callback',base).toString();
  const state=createInstagramState({clientId:client.id,organizationId:client.organization_id,userId:user.id,exp:Date.now()+10*60*1000},stateSecret);
  const authUrl=new URL('https://www.facebook.com/dialog/oauth');
  authUrl.searchParams.set('client_id',appId);
  authUrl.searchParams.set('config_id',configId);
  authUrl.searchParams.set('display','popup');
  authUrl.searchParams.set('redirect_uri',redirectUri);
  authUrl.searchParams.set('response_type','code');
  authUrl.searchParams.set('override_default_response_type','true');
  authUrl.searchParams.set('state',state);
  return json({url:authUrl.toString()});
 }catch(error){return errorResponse(error)}
}
export async function DELETE(request){
 try{
  const {db,user}=await authenticate(request),body=await request.json(),client=await agencyClient(db,user,body.clientId);
  checked(await adminDb().from('client_instagram_connections').delete().eq('client_id',client.id).eq('organization_id',client.organization_id));
  return json({disconnected:true});
 }catch(error){return errorResponse(error)}
}
