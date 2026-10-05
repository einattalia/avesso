import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {S3Client} from '@aws-sdk/client-s3';
import {fail,PART_SIZE} from './upload-policy.mjs';

export function config() {
  const env = process.env;
  const required = ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET_NAME'];
  if (required.some(k => !env[k]) || !(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) fail('O armazenamento R2 ainda não foi configurado.',503);
  const maxBytes=Number(env.R2_MAX_FILE_BYTES || 50*1024**3);
  if(!Number.isSafeInteger(maxBytes)||maxBytes<=0||maxBytes>10000*PART_SIZE) fail('Limite de armazenamento inválido.',503);
  return {bucket:env.R2_BUCKET_NAME, maxBytes, s3:new S3Client({region:'auto',endpoint:`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'})};
}
export async function authenticate(request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) fail('Entre novamente para acessar os arquivos.',401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) fail('Supabase não configurado.',503);
  const db = createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error} = await db.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) fail('Sua sessão expirou. Entre novamente.',401);
  return {db,user:data.user};
}
export function adminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function demandAccess(db,user,demandId,write=false) {
  const {data:d,error} = await db.from('demands').select('id,client_id,organization_id').eq('id',demandId).maybeSingle();
  if (error || !d) fail('Demanda indisponível.',404);
  const {data:members,error:me} = await db.from('organization_members').select('role').eq('organization_id',d.organization_id).eq('user_id',user.id).eq('is_active',true);
  if (me) fail('Não foi possível verificar suas permissões.',403);
  const agency = members?.some(m => m.role && m.role !== 'client_user');
  if (agency) return {d,agency:true};
  if (write) fail('Somente a equipe da agência pode enviar versões.',403);
  const {data:clients,error:ce} = await db.from('client_users').select('client_id').eq('client_id',d.client_id).eq('user_id',user.id);
  if (ce || !clients?.length || !members?.some(m=>m.role==='client_user')) fail('Sem acesso a este cliente.',403);
  return {d,agency:false};
}
export async function contractAccess(db,user,contractId) {
  const {data:d,error}=await db.from('contracts').select('id,client_id,organization_id').eq('id',contractId).maybeSingle();
  if(error||!d) fail('Contrato indisponível.',404);
  const {data:members,error:me}=await db.from('organization_members').select('role').eq('organization_id',d.organization_id).eq('user_id',user.id).eq('is_active',true);
  if(me||!members?.some(m=>m.role&&m.role!=='client_user')) fail('Somente a equipe responsável pode acessar os documentos do contrato.',403);
  return {d,agency:true};
}
