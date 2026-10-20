'use client';
import {useEffect,useState} from 'react';
import {downloadMonthlyPlanPdf} from '../../lib/monthly-plan-pdf.mjs';

function todayKey(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function formatDate(v){return v?new Date(v+'T12:00:00').toLocaleDateString('pt-BR'):'Data não definida'}
function category(a,t){if(a.status==='adjustments')return 'ajustes';if(['delivered','posted'].includes(a.status)||(a.publishDate&&a.publishDate<=t&&['approved','awaiting_scheduling','scheduled'].includes(a.status)))return 'entregas';if(a.publishDate&&a.publishDate>t&&['approved','awaiting_scheduling','scheduled'].includes(a.status))return 'agendados';return 'aprovados'}
const tabs=[['planejamento','Planejamento mensal'],['ajustes','Ajustes solicitados'],['aprovados','Aprovados'],['agendados','Agendados'],['entregas','Entregues']];
function monthTitle(v){return new Date(v.slice(0,7)+'-01T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}
function itemStatus(s){return ({pending:'Aguardando sua opinião',approved:'Ideia aprovada',changes_requested:'Sugestão enviada'})[s]||'Em planejamento'}
function PortalArts({arts,tab,today}){
 const visible=arts.filter(a=>category(a,today)===tab);
 return <section className="clientPortalContent">{visible.length===0?<div className="portalEmpty"><h2>Nenhuma arte nesta divisão</h2><p>Quando houver novas artes, elas aparecerão aqui.</p></div>:<div className="portalArtGrid">{visible.map(art=><article className={'portalArtCard'+(tab==='ajustes'?' portalArtCardAdjustment':'')} key={art.id}><div className="portalArtHeading"><div><small>{art.type||'Conteúdo'}</small><h2>{art.title}</h2></div><span className="portalStatus">{tab==='entregas'?'Entregue':tab==='agendados'?'Agendado':tab==='ajustes'?'Ajustes solicitados':'Aprovado'}</span></div>{tab==='ajustes'&&art.reviewNote&&<div className="portalReviewNote"><strong>Pedido de ajuste</strong><p>{art.reviewNote}</p></div>}{art.publishDate&&tab!=='ajustes'&&<p className="portalPublishDate">{tab==='entregas'?'Publicado em':'Postagem prevista para'} {formatDate(art.publishDate)}{art.publishTime?' às '+art.publishTime.slice(0,5):''}</p>}<div className="portalAssets">{art.assets.map(asset=><div className="portalAsset" key={asset.id}>{asset.mimeType?.startsWith('image/')?<a href={asset.fileUrl} target="_blank" rel="noreferrer" className="portalImageLink"><img src={asset.fileUrl} alt={asset.caption||art.title}/></a>:<a className="portalFileLink" href={asset.fileUrl} target="_blank" rel="noreferrer">Abrir arquivo: {asset.fileName||'Visualizar arte'}</a>}{asset.caption&&<p>{asset.caption}</p>}</div>)}</div></article>)}</div>}</section>;
}
function EvaluationForm({plan,onSubmit,busy,error}){
 const [rating,setRating]=useState(plan.clientRating||0),[feedback,setFeedback]=useState(plan.clientFeedback||'');
 useEffect(()=>{setRating(plan.clientRating||0);setFeedback(plan.clientFeedback||'')},[plan.id,plan.clientRating,plan.clientFeedback]);
 const labels=['','Péssimo','Ruim','Regular','Bom','Excelente'];
 return <section className="portalMonthlyEvaluation">
  <div className="portalEvaluationHeader"><div><small>AVALIAÇÃO DO MÊS</small><h3>Como foi nosso trabalho neste mês?</h3><p>Sua opinião ajuda a Avesso a melhorar o planejamento e as entregas.</p></div></div>
  <div className="portalStarRating" role="radiogroup" aria-label="Avalie o mês de trabalho">
   {[1,2,3,4,5].map(value=><button key={value} type="button" role="radio" aria-checked={rating===value} aria-label={value+' estrela'+(value>1?'s':'')} className={value<=rating?'selected':''} onClick={()=>setRating(value)}>★</button>)}
   <span>{rating?labels[rating]:'Escolha uma nota de 1 a 5'}</span>
  </div>
  <label className="portalEvaluationComment">Comentário (opcional)<textarea rows="3" maxLength="4000" value={feedback} onChange={event=>setFeedback(event.target.value)} placeholder="Conte como foi sua experiência com o planejamento e o trabalho do mês."/></label>
  {error&&<p className="portalEvaluationError" role="alert">{error}</p>}
  <div className="portalEvaluationFooter"><button type="button" className="portalApproveButton" disabled={!rating||busy} onClick={()=>onSubmit(plan.id,rating,feedback)}>{busy?'Enviando...':plan.clientRating?'Atualizar avaliação':'Enviar avaliação'}</button>{plan.clientFeedbackAt&&<small>Última avaliação: {new Date(plan.clientFeedbackAt).toLocaleDateString('pt-BR')}</small>}</div>
 </section>;
}
function MonthlyPlans({plans,clientName,notes,setNotes,working,respond,error,onEvaluate,evaluationWorking}){
 return <section className="clientPortalContent portalPlans">
  {error&&<div className="portalActionError">{error}</div>}
  {plans.length===0?<div className="portalEmpty"><h2>Nenhum planejamento compartilhado</h2><p>Quando a equipe Avesso compartilhar o planejamento do mês, ele ficará disponível aqui.</p></div>:plans.map(plan=>(
   <article className="portalPlanCard" key={plan.id}>
    <header className="portalPlanHeader"><div><small>PROPOSTA DE PLANEJAMENTO</small><h2>{monthTitle(plan.planMonth)}</h2><p>{plan.items.length} {plan.items.length===1?'arte planejada':'artes planejadas'}</p></div><button type="button" className="portalDownloadButton" onClick={()=>downloadMonthlyPlanPdf({clientName,month:plan.planMonth.slice(0,7),items:plan.items})}>Baixar planejamento em PDF</button></header>
    <div className="portalPlanItems">{plan.items.map((item,index)=>(
     <article className="portalPlanItem" key={item.id}>
      <div className="portalPlanItemHeading"><div><small>IDEIA {String(index+1).padStart(2,'0')}</small><h3>{item.title}</h3></div><span className={'portalPlanStatus status-'+item.status}>{itemStatus(item.status)}</span></div>
      {item.format&&<p className="portalPlanFormat">{item.format}</p>}
      {(item.designerName||item.videomakerName)&&<p className="portalPlanResponsibles">{item.designerName&&<>Designer: {item.designerName}</>}{item.designerName&&item.videomakerName?' · ':''}{item.videomakerName&&<>Videomaker: {item.videomakerName}</>}</p>}
      {item.description&&<p className="portalPlanDescription">{item.description}</p>}
      {item.review_note&&<div className="portalReviewNote"><strong>Sua sugestão</strong><p>{item.review_note}</p></div>}
      {['pending','changes_requested'].includes(item.status)&&<div className="portalPlanResponse"><label>Como podemos melhorar essa ideia?<textarea rows="3" value={notes[item.id]||''} onChange={event=>setNotes(old=>({...old,[item.id]:event.target.value}))} placeholder="Compartilhe sua opinião ou sugestão para este conteúdo."/></label><div className="portalPlanActions"><button type="button" className="portalAdjustButton" disabled={working===item.id} onClick={()=>respond(item,'changes')}>{working===item.id?'Enviando...':'Enviar sugestão'}</button><button type="button" className="portalApproveButton" disabled={working===item.id} onClick={()=>respond(item,'approve')}>{working===item.id?'Enviando...':'Aprovar ideia'}</button></div></div>}
     </article>
    ))}</div>
    <EvaluationForm plan={plan} onSubmit={onEvaluate} busy={evaluationWorking===plan.id} error={error}/>
   </article>
  ))}
 </section>;
}
export default function ClientPortal({token}){
 const [data,setData]=useState(null),[tab,setTab]=useState('planejamento'),[error,setError]=useState(''),[loading,setLoading]=useState(true),[working,setWorking]=useState(''),[evaluationWorking,setEvaluationWorking]=useState(''),[notes,setNotes]=useState({}),[actionError,setActionError]=useState('');
 async function loadPortal(){const r=await fetch('/api/client-portal/'+encodeURIComponent(token),{cache:'no-store'});const b=await r.json();if(!r.ok)throw new Error(b.error||'Este link não está disponível.');setData(b)}
 useEffect(()=>{let active=true;fetch('/api/client-portal/'+encodeURIComponent(token),{cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error||'Este link não está disponível.');return b}).then(b=>{if(active)setData(b)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[token]);
 async function submitEvaluation(planId,rating,feedback){setEvaluationWorking(planId);setActionError('');try{const r=await fetch('/api/client-portal/'+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision:'evaluate',planId,rating,feedback})});const b=await r.json();if(!r.ok)throw new Error(b.error||'Não foi possível salvar sua avaliação.');await loadPortal()}catch(e){setActionError(e.message||'Não foi possível salvar sua avaliação.')}finally{setEvaluationWorking('')}}
 async function respond(item,decision){const note=(notes[item.id]||'').trim();if(decision==='changes'&&note.length<3){setActionError('Descreva os ajustes necessários antes de enviar.');return}setWorking(item.id);setActionError('');try{const r=await fetch('/api/client-portal/'+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemId:item.id,decision,note})});const b=await r.json();if(!r.ok)throw new Error(b.error||'Não foi possível registrar sua resposta.');await loadPortal()}catch(e){setActionError(e.message||'Não foi possível registrar sua resposta.')}finally{setWorking('')}}
 const today=todayKey(),arts=data?.arts||[],plans=data?.monthlyPlans||[];
 return <main className="clientPortalPage"><header className="clientPortalHeader"><a className="portalBrand" href="/">AVESSO</a><span>PORTAL DO CLIENTE</span></header>{loading?<p className="portalMessage">Carregando suas artes...</p>:error?<section className="portalMessage portalError"><h1>Portal indisponível</h1><p>{error}</p><small>Peça à equipe Avesso um novo link de acesso.</small></section>:<><section className="clientPortalIntro"><small>SEU ESPAÇO DE CONTEÚDOS</small><h1>{data.clientName}</h1><p>Veja a proposta de conteúdos do mês e participe com sua opinião.</p></section><nav className="clientPortalTabs" aria-label="Divisões do portal">{tabs.map(([key,label])=><button type="button" key={key} className={tab===key?'active':''} aria-pressed={tab===key} onClick={()=>{setTab(key);setActionError('')}}>{label}<span>{key==='planejamento'?plans.length:arts.filter(a=>category(a,today)===key).length}</span></button>)}</nav>{tab==='planejamento'?<MonthlyPlans plans={plans} clientName={data.clientName} notes={notes} setNotes={setNotes} working={working} respond={respond} error={actionError} onEvaluate={submitEvaluation} evaluationWorking={evaluationWorking}/>:<PortalArts arts={arts} tab={tab} today={today}/>}</>}<footer className="clientPortalFooter">Acesso privado do cliente · Avesso</footer></main>;
}
