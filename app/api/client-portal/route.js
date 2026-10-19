import {authenticate,adminDb} from '../../../lib/r2-server';
import {fail} from '../../../lib/upload-policy.mjs';
import {createClientPortalToken,hashClientPortalToken} from '../../../lib/client-portal-token.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};

export async function POST(request){
  try{
    const {db,user}=await authenticate(request);
    const raw=await request.text();
    if(raw.length>8192)fail('Solicitação muito grande.',413);
    let body;try{body=JSON.parse(raw)}catch{fail('Solicitação inválida.')}
    if(!body||!['issue','revoke'].includes(body.action)||typeof body.clientId!=='string')fail('Operação inválida.');

    const admin=adminDb();
    const {data:client,error:clientError}=await admin.from('clients').select('id,organization_id').eq('id',body.clientId).maybeSingle();
    if(clientError)throw clientError;
    if(!client)fail('Cliente indisponível.',404);

    const {data:membership,error:membershipError}=await db.from('organization_members').select('role').eq('organization_id',client.organization_id).eq('user_id',user.id).eq('is_active',true);
    if(membershipError||!membership?.some(member=>['super_admin','agency_owner','agency_admin','team_member'].includes(member.role)))fail('Sem acesso para gerenciar o portal deste cliente.',403);

    if(!process.env.SUPABASE_SERVICE_ROLE_KEY)fail('Portal do cliente ainda não configurado.',503);
    if(body.action==='revoke'){
      const {error}=await admin.from('client_portal_tokens').update({revoked_at:new Date().toISOString()}).eq('client_id',client.id);
      if(error)throw error;
      return Response.json({revoked:true},{headers});
    }

    const token=createClientPortalToken();
    const {error}=await admin.from('client_portal_tokens').upsert({client_id:client.id,organization_id:client.organization_id,token_hash:hashClientPortalToken(token),created_at:new Date().toISOString(),revoked_at:null},{onConflict:'client_id'});
    if(error)throw error;
    const base=process.env.APP_URL||new URL(request.url).origin;
    return Response.json({url:new URL('/portal/'+token,base).toString()},{headers});
  }catch(error){
    if(!error.status)console.error('AVESSO client portal link failed',{code:error.code||error.name});
    return Response.json({error:error.status?error.message:'Não foi possível atualizar o link do portal.'},{status:error.status||500,headers});
  }
}
