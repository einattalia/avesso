export const PRODUCTION_STATES=[['in_production','Em produção'],['with_client','Aguardando aprovação'],['approved','Aprovado'],['awaiting_scheduling','Aguardando agendamento'],['scheduled','Agendado'],['posted','Postado']];
export function workflowState(status) {
  return ['briefing','awaiting_material','internal_review','adjustments'].includes(status)?'in_production':status;
}
export function productionLabel(status) {
  if(['adjustments','internal_review','briefing','awaiting_material'].includes(status))return ({adjustments:'Ajustes solicitados',internal_review:'Revisão interna',briefing:'Briefing',awaiting_material:'Aguardando material'})[status];
  return PRODUCTION_STATES.find(([key])=>key===workflowState(status))?.[1]||({delivered:'Entregue'})[status]||status;
}
export function brazilPhone(value) {
  const digits=String(value||'').replace(/\D/g,'');
  const phone=digits.length===10||digits.length===11?'55'+digits:digits;
  if(!/^55[1-9]\d{9,10}$/.test(phone))throw new Error('Cadastre o WhatsApp do cliente com DDD.');
  return phone;
}
export function approvalUrl(base,demandId) {
  const url=new URL(base);if(url.protocol!=='https:'||url.username||url.password)throw new Error('APP_URL deve usar HTTPS.');
  url.search='';url.hash='';url.searchParams.set('approval',demandId);return url.toString();
}
export function templateMessage({phone,title,demandId,template,language='pt_BR'}) {
  return {messaging_product:'whatsapp',to:brazilPhone(phone),type:'template',template:{name:template,language:{code:language},components:[{type:'body',parameters:[{type:'text',text:String(title).slice(0,200)}]},{type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:demandId}]}]}};
}
