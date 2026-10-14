import {fail} from './upload-policy.mjs';

export function r2Endpoint(accountId) {
  const id=String(accountId||'').trim();
  if(!/^[a-f0-9]{32}$/i.test(id)) fail('R2_ACCOUNT_ID inválido na Vercel. Informe somente o ID de conta de 32 caracteres, sem URL, nome do bucket ou aspas, e publique um novo deploy.',503);
  return `https://${id.toLowerCase()}.r2.cloudflarestorage.com`;
}

export function fileErrorDetails(error,operation) {
  let current=error,dns=null;
  for(let i=0;current&&i<5;i++,current=current.cause) {
    if(['ENOTFOUND','EAI_AGAIN'].includes(current.code)){dns=current;break;}
  }
  const hostname=dns?.hostname;
  // Only record known storage/auth domains; never log credentials, headers, URLs or file content.
  const safeHost=typeof hostname==='string'&&/^(?:[a-f0-9]{32}\.r2\.cloudflarestorage\.com|[a-z0-9]{20}\.supabase\.co)$/i.test(hostname)?hostname:undefined;
  const code=String(dns?.code||error?.code||error?.Code||error?.name||'UNKNOWN').replace(/[^a-zA-Z0-9_]/g,'').slice(0,64);
  const rawHttp=Number(error?.$metadata?.httpStatusCode);
  const httpStatus=Number.isInteger(rawHttp)&&rawHttp>=100&&rawHttp<=599?rawHttp:undefined;
  if(dns) return {
    status:503,
    message:safeHost?.endsWith('.supabase.co')?'Não foi possível localizar o servidor do Supabase. Confira NEXT_PUBLIC_SUPABASE_URL e tente novamente.':'Não foi possível localizar o servidor de armazenamento (DNS). Confira R2_ACCOUNT_ID no deploy de Production. O código do erro é '+code+'.',
    log:{code,operation,hostname:safeHost||'indisponível'}
  };
  const location={'complete:head-before':'verificar o arquivo no R2','complete:list-parts':'consultar as partes no R2','complete:r2-multipart':'concluir as partes no R2','complete:head-after':'verificar o arquivo concluído no R2','complete:database':'registrar o arquivo no Supabase'}[operation];
  const message=location?`Não foi possível ${location}. Código: ${code}${httpStatus?' (HTTP '+httpStatus+')':''}. Selecione o mesmo arquivo para retomar.`:'Não foi possível concluir. Tente novamente; o envio pode ser retomado.';
  return {status:error?.status||500,message:error?.status?error.message:message,log:{code,operation,...(httpStatus?{httpStatus}:{})}};
}
