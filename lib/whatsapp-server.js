import 'server-only';
import {templateMessage,approvalUrl} from './production-policy.mjs';

export async function dispatchApproval(admin,demandId) {
  const env=process.env;
  const required=['WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_TEMPLATE_NAME','WHATSAPP_API_VERSION','APP_URL'];
  if(env.WHATSAPP_ENABLED!=='true'||required.some(key=>!env[key]))return {state:'not_configured',message:'Aprovação disponível no portal. Configure a API do WhatsApp para enviar o aviso automático.'};
  if(!/^v\d+\.\d+$/.test(env.WHATSAPP_API_VERSION)||!/^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID))return {state:'not_configured',message:'Confira a versão da API e o ID do número de WhatsApp.'};
  try{approvalUrl(env.APP_URL,demandId)}catch{return {state:'not_configured',message:'Confira APP_URL: o endereço do portal deve usar HTTPS.'}}
  const {data:job,error}=await admin.rpc('avesso_claim_approval_notification',{target_demand:demandId});
  if(error)throw error;
  if(!job)return {state:'idle',message:'Não há aviso pendente de envio.'};
  let result;
  let payload;
  try{payload=templateMessage({phone:job.phone,title:job.title,demandId:job.demand_id,template:env.WHATSAPP_TEMPLATE_NAME,language:env.WHATSAPP_TEMPLATE_LANGUAGE||'pt_BR'})}catch{result={state:'failed',code:'INVALID_RECIPIENT'}}
  if(!result){
  try {
    const response=await fetch(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{
      method:'POST',headers:{Authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,'Content-Type':'application/json'},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)
    });
    const data=await response.json().catch(()=>null);
    if(response.ok&&data?.messages?.[0]?.id)result={state:'accepted',messageId:data.messages[0].id,code:null};
    else if(!response.ok)result={state:'failed',code:String(data?.error?.code||response.status).slice(0,64)};
    else result={state:'uncertain',code:'NO_MESSAGE_ID'};
  }catch{result={state:'uncertain',code:'NETWORK_RESULT_UNKNOWN'}}
  }
  const {error:saveError}=await admin.rpc('avesso_finish_approval_notification',{job_id:job.id,lease_id:job.lease_id,result_state:result.state,result_message_id:result.messageId||null,result_code:result.code||null});
  if(saveError)return {state:'uncertain',message:'A confirmação do envio não pôde ser registrada. Confira o WhatsApp antes de reenviar.'};
  return {state:result.state,message:result.state==='accepted'?'Aviso aceito pela API do WhatsApp.':result.state==='uncertain'?'Não foi possível confirmar o envio do aviso. Confira o WhatsApp antes de tentar novamente.':'A aprovação foi publicada, mas o WhatsApp recusou o aviso. Confira a configuração e o consentimento do cliente.',code:result.code};
}
