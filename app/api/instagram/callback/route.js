import {adminDb} from '../../../../lib/r2-server';
import {encryptInstagramToken,readInstagramState} from '../../../../lib/instagram-connect.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none';"};
function completionPage(origin,payload){
 const safe=JSON.stringify(payload).replace(/</g,'\\u003c');
 const target=JSON.stringify(origin);
 return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conexão do Instagram</title><body><p>Finalizando conexão…</p><script>const data=${safe};if(window.opener){window.opener.postMessage({type:'avesso-instagram-connection',...data},${target});window.close()}else{location.replace('/')}</script></body></html>`,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}
function graphVersion(){
 const value=process.env.META_GRAPH_API_VERSION||'v27.0';
 if(!/^v\d+\.\d+$/.test(value))throw new Error('invalid graph api version');
 return value;
}
function graphUrl(path){
 const version=graphVersion();
 return new URL(`https://graph.facebook.com/${version}/${path}`);
}
function appOrigin(){const value=process.env.APP_URL;if(!value)throw new Error('missing app url');const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||(url.protocol==='http:'&&!['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('invalid app url');return url.origin}
async function graphGet(url,accessToken){
 url.searchParams.set('access_token',accessToken);
 const response=await fetch(url,{cache:'no-store'});
 const data=await response.json();
 if(!response.ok||data.error)throw new Error('Meta Graph request failed');
 return data;
}
async function exchange(code,redirectUri){
 const appId=process.env.META_INSTAGRAM_APP_ID,secret=process.env.META_INSTAGRAM_APP_SECRET;
 if(!appId||!secret||!process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY||!process.env.INSTAGRAM_STATE_SECRET)throw new Error('missing configuration');
 const tokenUrl=graphUrl('oauth/access_token');
 tokenUrl.searchParams.set('client_id',appId);
 tokenUrl.searchParams.set('client_secret',secret);
 tokenUrl.searchParams.set('redirect_uri',redirectUri);
 tokenUrl.searchParams.set('code',code);
 const tokenData=await graphGet(tokenUrl,'');
 if(!tokenData.access_token)throw new Error('authorization exchange failed');
 const me=await graphGet(graphUrl('me?fields=id'),tokenData.access_token);
 if(!me.id)throw new Error('system user lookup failed');
 const accounts=await graphGet(graphUrl(`${encodeURIComponent(me.id)}/assigned_instagram_accounts?fields=id,username`),tokenData.access_token);
 const list=Array.isArray(accounts.data)?accounts.data:[];
 if(list.length!==1)throw new Error(list.length?'multiple Instagram accounts selected':'no Instagram account available');
 const profile=list[0];
 if(!profile.id||!profile.username)throw new Error('Instagram account lookup failed');
 return {token:tokenData.access_token,profile,expiresIn:Number(tokenData.expires_in)||null};
}
export async function GET(request){
 const origin=(()=>{try{return appOrigin()}catch{return null}})();
 if(!origin)return new Response('Configuração da integração incompleta.',{status:503,headers});
 const url=new URL(request.url),stateSecret=process.env.INSTAGRAM_STATE_SECRET;
 let state;
 try{if(!stateSecret)throw new Error();state=readInstagramState(url.searchParams.get('state'),stateSecret)}catch{return new Response('Estado de autorização inválido ou expirado. Feche esta janela e tente novamente.',{status:400,headers})}
 const payload={clientId:state.clientId,connected:false};
 if(url.searchParams.has('error')||!url.searchParams.get('code'))return completionPage(origin,{...payload,error:'A autorização do Instagram foi cancelada ou não foi concluída.'});
 try{
  const {data:client,error:clientError}=await adminDb().from('clients').select('id,organization_id').eq('id',state.clientId).eq('organization_id',state.organizationId).maybeSingle();
  if(clientError||!client)throw new Error('client unavailable');
  const {data:members,error:memberError}=await adminDb().from('organization_members').select('role').eq('organization_id',client.organization_id).eq('user_id',state.userId).eq('is_active',true);
  if(memberError||!members?.some(member=>member.role&&member.role!=='client_user'))throw new Error('permission changed');
  const redirectUri=new URL('/api/instagram/callback',process.env.APP_URL).toString();
  const {token,profile,expiresIn}=await exchange(url.searchParams.get('code'),redirectUri);
  const expiresAt=expiresIn?new Date(Date.now()+expiresIn*1000).toISOString():null;
  const {error}=await adminDb().from('client_instagram_connections').upsert({
   client_id:client.id,organization_id:client.organization_id,instagram_user_id:String(profile.id),
   username:String(profile.username).replace(/^@/,''),account_type:null,
   access_token_ciphertext:encryptInstagramToken(token),token_expires_at:expiresAt,connected_by:state.userId,updated_at:new Date().toISOString()
  },{onConflict:'client_id'});
  if(error)throw error;
  return completionPage(origin,{...payload,connected:true,username:String(profile.username).replace(/^@/,'')});
 }catch(error){
  console.error('AVESSO Instagram callback failed',{name:error?.name||'Error'});
  const message=error?.message==='multiple Instagram accounts selected'?'A autorização retornou mais de uma conta do Instagram. Para este cliente, conecte apenas uma conta por vez.':'Não foi possível concluir a conexão. Confira a configuração do aplicativo Meta e tente novamente.';
  return completionPage(origin,{...payload,error:message});
 }
}
