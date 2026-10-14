export const EVENT_TYPES={recording:'Gravação',meeting:'Reunião',post:'Postagem',block:'Bloqueio interno'};
export function safeLink(value){if(!value)return '';const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error('Use um link http ou https válido.');return u.href;}
export function textValue(value,max=20000){if(typeof value!=='string'||value.length>max)throw new Error('Texto inválido ou muito longo.');return value.trim();}
export function eventPayload(b){
 const start=new Date(b.starts_at),end=new Date(b.ends_at);
 if(!EVENT_TYPES[b.kind]||!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)throw new Error('Confira o tipo e os horários do compromisso.');
 const ids=[...new Set(b.member_ids||[])];if(ids.length>30||ids.some(x=>typeof x!=='string'))throw new Error('Responsáveis inválidos.');
 const before=Number(b.buffer_before||0),after=Number(b.buffer_after||0);
 if(![before,after].every(x=>Number.isInteger(x)&&x>=0&&x<=1440))throw new Error('Intervalo inválido.');
 return {title:textValue(b.title,200),kind:b.kind,starts_at:start.toISOString(),ends_at:end.toISOString(),member_ids:ids,buffer_before:before,buffer_after:after,location:textValue(b.location||'',500),notes:textValue(b.notes||''),status:b.status==='cancelled'?'cancelled':'scheduled',shared:b.kind==='block'?false:!!b.shared};
}
export function overlaps(a,b){if(a.kind==='post'||b.kind==='post'||a.status==='cancelled'||b.status==='cancelled')return false;const shared=!a.member_ids?.length||!b.member_ids?.length||a.member_ids.some(id=>b.member_ids.includes(id));return shared&&new Date(a.starts_at)-60000*(a.buffer_before||0)<+new Date(b.ends_at)+60000*(b.buffer_after||0)&&new Date(b.starts_at)-60000*(b.buffer_before||0)<+new Date(a.ends_at)+60000*(a.buffer_after||0);}
export function localInput(iso){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso)).replace(' ','T');}
export function brazilISO(value){return new Date(value+':00-03:00').toISOString();}
