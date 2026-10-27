'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {downloadMonthlyPlanPdf} from '../../lib/monthly-plan-pdf.mjs';
import NotificationBell from './NotificationBell';

function todayKey(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function formatDate(v){return v?new Date(v+'T12:00:00').toLocaleDateString('pt-BR'):'Data não definida'}
function category(a,t){if(a.status==='with_client')return 'aguardando';if(a.status==='adjustments')return 'ajustes';if(['delivered','posted'].includes(a.status)||(a.publishDate&&a.publishDate<=t&&['approved','awaiting_scheduling','scheduled'].includes(a.status)))return 'entregas';if(a.publishDate&&a.publishDate>t&&['approved','awaiting_scheduling','scheduled'].includes(a.status))return 'agendados';return 'aprovados'}
const tabs=[['planejamento','Planejamento mensal'],['aguardando','Aguardando aprovação'],['ajustes','Ajustes solicitados'],['aprovados','Aprovados'],['agendados','Agendados'],['calendario','Calendário de postagens'],['entregas','Entregues']];
function monthTitle(v){return new Date(v.slice(0,7)+'-01T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}
function dateLabel(v){return v?new Date(v+'T12:00:00').toLocaleDateString('pt-BR'):'a definir'}
function itemStatus(s){return ({pending:'Aguardando sua opinião',approved:'Ideia aprovada',changes_requested:'Sugestão enviada'})[s]||'Em planejamento'}
function PortalArts({arts,tab,today,onDecision,working,error}){
 const visible=arts.filter(a=>category(a,today)===tab);
 const [selected,setSelected]=useState({}),[notes,setNotes]=useState({}),[compareSelected,setCompareSelected]=useState({}),[openComparison,setOpenComparison]=useState(null);
 function toggleCompare(artId,assetId){setCompareSelected(current=>{const values=current[artId]||[];return {...current,[artId]:values.includes(assetId)?values.filter(id=>id!==assetId):[...values,assetId]}})}
 return <section className="clientPortalContent">{error&&<div className="portalActionError" role="alert">{error}</div>}{visible.length===0?<div className="portalEmpty"><h2>Nenhuma arte nesta divisão</h2><p>Quando houver novas artes, elas aparecerão aqui.</p></div>:<div className="portalArtGrid">{visible.map(art=>{
  const pending=tab==='aguardando',selectedVersion=selected[art.id]||art.assets[0]?.id,requestNote=notes[art.id]||'',carousel=pending&&art.reviewMode==='bundle'&&art.assets.length>1,compareIds=compareSelected[art.id]||[],comparisonAssets=openComparison?.artId===art.id?art.assets.filter(asset=>openComparison.assetIds.includes(asset.id)):[],comparisonTitle='portal-compare-title-'+art.id;
  return <article className={'portalArtCard'+(tab==='ajustes'?' portalArtCardAdjustment':'')+(pending?' portalArtCardApproval':'')+(carousel?' portalArtCardBundle':'')} key={art.id}>
   <div className="portalArtHeading"><div><small>{art.type||'Conteúdo'}</small><h2>{art.title}</h2></div><span className="portalStatus">{pending?'Aguardando aprovação':tab==='entregas'?'Entregue':tab==='agendados'?'Agendado':tab==='ajustes'?'Ajustes solicitados':'Aprovado'}</span></div>
   {tab==='ajustes'&&art.reviewNote&&<div className="portalReviewNote"><strong>Pedido de ajuste</strong><p>{art.reviewNote}</p></div>}
   {art.publishDate&&tab!=='ajustes'&&<p className="portalPublishDate">{tab==='entregas'?'Publicado em':'Postagem prevista para'} {formatDate(art.publishDate)}{art.publishTime?' às '+art.publishTime.slice(0,5):''}</p>}
   <div className="portalAssets">{art.assets.map(asset=><div className="portalAsset" key={asset.id}>
    {pending&&art.reviewMode!=='bundle'&&<label className="portalAssetChoice"><input type="radio" name={'choice-'+art.id} checked={selectedVersion===asset.id} onChange={()=>setSelected(current=>({...current,[art.id]:asset.id}))}/><span>Escolher esta arte</span></label>}
    {carousel&&asset.mimeType?.startsWith('image/')&&<label className="portalAssetChoice portalCompareChoice"><input type="checkbox" checked={compareIds.includes(asset.id)} onChange={()=>toggleCompare(art.id,asset.id)}/><span>Selecionar para ver ao lado</span></label>}
    {asset.mimeType?.startsWith('image/')?<a href={asset.fileUrl} target="_blank" rel="noreferrer" className="portalImageLink"><img src={asset.fileUrl} alt={asset.caption||art.title}/></a>:<a className="portalFileLink" href={asset.fileUrl} target="_blank" rel="noreferrer">Abrir arquivo: {asset.fileName||'Visualizar arte'}</a>}
    {asset.caption&&<p>{asset.caption}</p>}
   </div>)}</div>
   {carousel&&<button type="button" className="portalCompareButton" disabled={compareIds.length<2} onClick={()=>setOpenComparison({artId:art.id,assetIds:compareIds})}>Ver fotos lado a lado{compareIds.length?' ('+compareIds.length+')':''}</button>}
   {pending&&<div className="portalArtDecision"><p>{art.reviewMode==='bundle'?'As imagens deste carrossel serão aprovadas juntas.':'Escolha uma das artes para aprovar.'}</p><label>Se precisar de ajustes, descreva aqui<textarea rows="3" maxLength="20000" value={requestNote} onChange={event=>setNotes(current=>({...current,[art.id]:event.target.value}))} placeholder="Escreva o que precisa ser ajustado."/></label><div><button type="button" className="portalAdjustButton" disabled={working===art.id} onClick={()=>onDecision(art,'requestArtChanges',art.reviewMode==='bundle'?null:selectedVersion,requestNote)}>{working===art.id?'Enviando...':'Solicitar ajustes'}</button><button type="button" className="portalApproveButton" disabled={working===art.id||(!selectedVersion&&art.reviewMode!=='bundle')} onClick={()=>onDecision(art,'approveArt',art.reviewMode==='bundle'?null:selectedVersion,'')}>{working===art.id?'Registrando...':'Aprovar arte'}</button></div></div>}
   {comparisonAssets.length>0&&<div className="portalCompareBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpenComparison(null)}}><section className="portalCompareModal" role="dialog" aria-modal="true" aria-labelledby={comparisonTitle}><header><div><small>PRÉVIA DO CARROSSEL</small><h2 id={comparisonTitle}>{art.title}</h2><p>Fotos selecionadas para conferir lado a lado.</p></div><button type="button" className="portalCompareClose" aria-label="Fechar prévia" onClick={()=>setOpenComparison(null)}>×</button></header><div className="portalCompareGrid">{comparisonAssets.map(asset=><figure key={asset.id}><img src={asset.fileUrl} alt={asset.caption||art.title}/>{asset.caption&&<figcaption>{asset.caption}</figcaption>}</figure>)}</div></section></div>}
  </article>
 })}</div>}</section>;
}
function currentCalendarMonth(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function shiftCalendarMonth(value,offset){const [year,month]=value.split('-').map(Number);const d=new Date(year,month-1+offset,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function PortalCalendar({arts}){
 const [month,setMonth]=useState(currentCalendarMonth);
 const eligible=arts.filter(art=>art.publishDate&&['approved','awaiting_scheduling','scheduled','delivered','posted'].includes(art.status));
 const [year,monthNumber]=month.split('-').map(Number);
 const daysInMonth=new Date(year,monthNumber,0).getDate();
 const leading=new Date(year,monthNumber-1,1).getDay();
 const cells=[...Array(leading).fill(null),...Array.from({length:daysInMonth},(_,index)=>index+1)];
 while(cells.length%7)cells.push(null);
 const byDate=new Map();
 for(const art of eligible){const list=byDate.get(art.publishDate)||[];list.push(art);byDate.set(art.publishDate,list)}
 const weekdays=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
 return <section className="clientPortalContent portalCalendar">
  <div className="portalCalendarHeader"><button type="button" aria-label="Mês anterior" onClick={()=>setMonth(value=>shiftCalendarMonth(value,-1))}>‹</button><h2>{monthTitle(month+'-01')}</h2><button type="button" aria-label="Próximo mês" onClick={()=>setMonth(value=>shiftCalendarMonth(value,1))}>›</button></div>
  <div className="portalCalendarGrid" role="grid" aria-label={'Calendário de postagens de '+monthTitle(month+'-01')}>{weekdays.map(day=><div className="portalCalendarWeekday" role="columnheader" key={day}>{day}</div>)}{cells.map((day,index)=>{const key=day?month+'-'+String(day).padStart(2,'0'):'';const dayArts=key?byDate.get(key)||[]:[];return <div className={'portalCalendarDay'+(!day?' isBlank':'')} role="gridcell" key={key||'blank-'+index}>{day&&<><span className="portalCalendarDayNumber">{day}</span><div className="portalCalendarEvents">{dayArts.map(art=><article className="portalCalendarEvent" key={art.id}><strong>{art.title}</strong><small>{art.publishTime?art.publishTime.slice(0,5):'Horário não definido'}</small></article>)}</div></>}</div>})}</div>
  {!eligible.some(art=>art.publishDate.slice(0,7)===month)&&<p className="portalCalendarEmpty">Nenhuma postagem programada para este mês.</p>}
 </section>;
}
function EvaluationForm({plan,onSubmit,busy,error}){
 const [rating,setRating]=useState(plan.clientRating||0),[feedback,setFeedback]=useState(plan.clientFeedback||'');
 useEffect(()=>{setRating(plan.clientRating||0);setFeedback(plan.clientFeedback||'')},[plan.id,plan.clientRating,plan.clientFeedback]);
 const labels=['','Péssimo','Ruim','Regular','Bom','Excelente'];
 return <section className="portalMonthlyEvaluation">
  <div className="portalEvaluationHeader"><div><small>AVALIAÇÃO DO MÊS</small><h3>Como foi nosso trabalho neste mês?</h3><p>Avalie o trabalho completo da Avesso neste mês: planejamento, criação, comunicação e entregas.</p></div></div>
  <div className="portalStarRating" role="radiogroup" aria-label="Avalie o mês de trabalho">
   {[1,2,3,4,5].map(value=><button key={value} type="button" role="radio" aria-checked={rating===value} aria-label={value+' estrela'+(value>1?'s':'')} className={value<=rating?'selected':''} onClick={()=>setRating(value)}>★</button>)}
   <span>{rating?labels[rating]:'Escolha uma nota de 1 a 5'}</span>
  </div>
  <label className="portalEvaluationComment">Comentário (opcional)<textarea rows="3" maxLength="4000" value={feedback} onChange={event=>setFeedback(event.target.value)} placeholder="Conte como foi o trabalho da Avesso neste mês, do planejamento à última entrega."/></label>
  {error&&<p className="portalEvaluationError" role="alert">{error}</p>}
  <div className="portalEvaluationFooter"><button type="button" className="portalApproveButton" disabled={!rating||busy} onClick={()=>onSubmit(plan.id,rating,feedback)}>{busy?'Enviando...':plan.clientRating?'Atualizar avaliação':'Enviar avaliação'}</button>{plan.clientFeedbackAt&&<small>Última avaliação: {new Date(plan.clientFeedbackAt).toLocaleDateString('pt-BR')}</small>}</div>
 </section>;
}
function MonthlyPlans({plans,clientName,notes,setNotes,working,respond,error,onEvaluate,evaluationWorking}){
 const [selectedPlanId,setSelectedPlanId]=useState(null);
 const selectedPlan=plans.find(plan=>plan.id===selectedPlanId)||null;
 return <section className="clientPortalContent portalPlans">
  {error&&<div className="portalActionError">{error}</div>}
  {!selectedPlan?plans.length===0?<div className="portalEmpty"><h2>Nenhum planejamento compartilhado</h2><p>Quando a equipe Avesso compartilhar o planejamento do mês, ele ficará disponível aqui.</p></div>:<div className="portalPlanMonthGrid">{plans.map(plan=><button type="button" className="portalPlanMonthFolder" key={plan.id} onClick={()=>setSelectedPlanId(plan.id)}><span className="portalPlanMonthFolderTop"><small>PASTA DO MÊS</small><span>Planejamento compartilhado</span></span><strong>{monthTitle(plan.planMonth)}</strong><span className="portalPlanMonthFolderCount">{plan.items.length} {plan.items.length===1?'ideia proposta':'ideias propostas'}</span><span className="portalPlanEvaluationStatus">{plan.clientRating?'Avaliação enviada':plan.evaluationAvailable?'Avaliação disponível':'Aguardando última postagem'}</span><span className="portalPlanMonthFolderOpen">Abrir planejamento <b>→</b></span></button>)}</div>:<>
   <button type="button" className="portalMonthlyBack" onClick={()=>setSelectedPlanId(null)}>← Todos os meses</button>
   <article className="portalPlanCard" key={selectedPlan.id}>
    <header className="portalPlanHeader"><div><small>PROPOSTA DE PLANEJAMENTO</small><h2>{monthTitle(selectedPlan.planMonth)}</h2><p>{selectedPlan.items.length} {selectedPlan.items.length===1?'ideia proposta':'ideias propostas'}</p></div><button type="button" className="portalDownloadButton" onClick={()=>downloadMonthlyPlanPdf({clientName,month:selectedPlan.planMonth.slice(0,7),items:selectedPlan.items})}>Baixar planejamento em PDF</button></header>
    <aside className="portalApprovalDeadline" aria-label="Prazo para aprovação"><strong>Data prevista para aprovação: {dateLabel(selectedPlan.approvalDeadline)}</strong><p>Após a data prevista, a equipe da Avesso entende que não há necessidade de alterar o planejamento.</p></aside>
    <div className="portalPlanItems">{selectedPlan.items.map((item,index)=>(
     <article className="portalPlanItem" key={item.id}>
      <div className="portalPlanItemHeading"><div><small>IDEIA {String(index+1).padStart(2,'0')}</small><h3>{item.title}</h3></div><span className={'portalPlanStatus status-'+item.status}>{itemStatus(item.status)}</span></div>
      {item.format&&<p className="portalPlanFormat">{item.format}</p>}
      {(item.designerName||item.videomakerName)&&<p className="portalPlanResponsibles">{item.designerName&&<>Designer: {item.designerName}</>}{item.designerName&&item.videomakerName?' · ':''}{item.videomakerName&&<>Videomaker: {item.videomakerName}</>}</p>}
      {item.description&&<p className="portalPlanDescription">{item.description}</p>}
      {item.review_note&&<div className="portalReviewNote"><strong>Sua sugestão</strong><p>{item.review_note}</p></div>}
      {['pending','changes_requested'].includes(item.status)&&<div className="portalPlanResponse"><label>O que você acha desta proposta? Deixe sua opinião ou sugestão.<textarea rows="3" value={notes[item.id]||''} onChange={event=>setNotes(old=>({...old,[item.id]:event.target.value}))} placeholder="Compartilhe sua opinião ou sugestão para este conteúdo."/></label><div className="portalPlanActions"><button type="button" className="portalAdjustButton" disabled={working===item.id} onClick={()=>respond(item,'changes')}>{working===item.id?'Enviando...':'Enviar sugestão'}</button><button type="button" className="portalApproveButton" disabled={working===item.id} onClick={()=>respond(item,'approve')}>{working===item.id?'Enviando...':'Aprovar proposta'}</button></div></div>}
     </article>
    ))}</div>
    {selectedPlan.evaluationAvailable?<EvaluationForm plan={selectedPlan} onSubmit={onEvaluate} busy={evaluationWorking===selectedPlan.id} error={error}/>:<section className="portalMonthlyEvaluation portalEvaluationPending"><div className="portalEvaluationHeader"><div><small>AVALIAÇÃO DO MÊS</small><h3>Sua avaliação será liberada após a última postagem.</h3><p>{selectedPlan.lastPublishDate?'Última postagem prevista: '+formatDate(selectedPlan.lastPublishDate):'Assim que as artes do mês tiverem datas de postagem, você verá por aqui quando a avaliação estiver disponível.'}</p></div></div></section>}
   </article>
  </>}
 </section>;
}
export default function ClientPortal({token}){
 const [data,setData]=useState(null),[tab,setTab]=useState('planejamento'),[error,setError]=useState(''),[loading,setLoading]=useState(true),[working,setWorking]=useState(''),[evaluationWorking,setEvaluationWorking]=useState(''),[notes,setNotes]=useState({}),[actionError,setActionError]=useState('');
 async function loadPortal(){const r=await fetch('/api/client-portal/'+encodeURIComponent(token),{cache:'no-store'});const b=await r.json();if(!r.ok)throw new Error(b.error||'Este link não está disponível.');setData(b)}
 useEffect(()=>{let active=true;fetch('/api/client-portal/'+encodeURIComponent(token),{cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error||'Este link não está disponível.');return b}).then(b=>{if(active)setData(b)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[token]);
 async function submitEvaluation(planId,rating,feedback){setEvaluationWorking(planId);setActionError('');try{const r=await fetch('/api/client-portal/'+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision:'evaluate',planId,rating,feedback})});const b=await r.json();if(!r.ok)throw new Error(b.error||'Não foi possível salvar sua avaliação.');await loadPortal()}catch(e){setActionError(e.message||'Não foi possível salvar sua avaliação.')}finally{setEvaluationWorking('')}}
 async function respond(item,decision){const note=(notes[item.id]||'').trim();if(decision==='changes'&&note.length<3){setActionError('Descreva os ajustes necessários antes de enviar.');return}setWorking(item.id);setActionError('');try{const r=await fetch('/api/client-portal/'+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemId:item.id,decision,note})});const b=await r.json();if(!r.ok)throw new Error(b.error||'Não foi possível registrar sua resposta.');await loadPortal()}catch(e){setActionError(e.message||'Não foi possível registrar sua resposta.')}finally{setWorking('')}}
 async function submitArtDecision(art,decision,versionId,note){const trimmed=(note||'').trim();if(decision==='requestArtChanges'&&trimmed.length<3){setActionError('Descreva os ajustes necessários antes de enviar.');return}setWorking(art.id);setActionError('');try{const r=await fetch('/api/client-portal/'+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({demandId:art.id,decision,versionId,note:trimmed})});const b=await r.json();if(!r.ok)throw new Error(b.error||'Não foi possível registrar sua decisão.');await loadPortal()}catch(e){setActionError(e.message||'Não foi possível registrar sua decisão.')}finally{setWorking('')}}
 const today=todayKey(),arts=data?.arts||[],plans=data?.monthlyPlans||[];
 const tabsRef=useRef(null),[tabScroll,setTabScroll]=useState({left:false,right:false});
 const syncPortalTabArrows=useCallback(()=>{const el=tabsRef.current;if(!el)return;const left=el.scrollLeft>2,right=el.scrollLeft+el.clientWidth<el.scrollWidth-2;setTabScroll(old=>old.left===left&&old.right===right?old:{left,right})},[]);
 const scrollPortalTabs=useCallback(direction=>{const el=tabsRef.current;if(el)el.scrollBy({left:direction*Math.max(220,el.clientWidth*.7),behavior:'smooth'})},[]);
 useEffect(()=>{const el=tabsRef.current;if(!el)return;syncPortalTabArrows();el.addEventListener('scroll',syncPortalTabArrows,{passive:true});window.addEventListener('resize',syncPortalTabArrows);return()=>{el.removeEventListener('scroll',syncPortalTabArrows);window.removeEventListener('resize',syncPortalTabArrows)}},[syncPortalTabArrows,tab,arts.length,plans.length]);
 return <main className="clientPortalPage"><header className="clientPortalHeader"><a className="portalBrand" href="/">AVESSO</a><span>PORTAL DO CLIENTE</span><NotificationBell portalToken={token}/></header>{loading?<p className="portalMessage">Carregando suas artes...</p>:error?<section className="portalMessage portalError"><h1>Portal indisponível</h1><p>{error}</p><small>Peça à equipe Avesso um novo link de acesso.</small></section>:<><section className="clientPortalIntro"><div className="portalClientIdentity">{data.clientLogoUrl&&<img src={data.clientLogoUrl} alt={"Logo de "+data.clientName}/>}<div><small>SEU ESPAÇO DE CONTEÚDOS</small><h1>{data.clientName}</h1></div></div><p>Confira as ideias que pensamos para este mês. Sua participação é importante: aprove, comente ou sugira ajustes em cada proposta.</p></section><div className="clientPortalTabsWrap"><button type="button" className="clientPortalTabArrow" aria-label="Mostrar divisões anteriores" disabled={!tabScroll.left} onClick={()=>scrollPortalTabs(-1)}>‹</button><nav ref={tabsRef} className="clientPortalTabs" aria-label="Divisões do portal" onScroll={syncPortalTabArrows}>{tabs.map(([key,label])=><button type="button" key={key} className={tab===key?'active':''} aria-pressed={tab===key} onClick={()=>{setTab(key);setActionError('')}}>{label}<span>{key==='planejamento'?plans.length:key==='calendario'?arts.filter(a=>a.publishDate&&['approved','awaiting_scheduling','scheduled','delivered','posted'].includes(a.status)).length:arts.filter(a=>category(a,today)===key).length}</span></button>)}</nav><button type="button" className="clientPortalTabArrow" aria-label="Mostrar próximas divisões" disabled={!tabScroll.right} onClick={()=>scrollPortalTabs(1)}>›</button></div>{tab==='planejamento'?<MonthlyPlans plans={plans} clientName={data.clientName} notes={notes} setNotes={setNotes} working={working} respond={respond} error={actionError} onEvaluate={submitEvaluation} evaluationWorking={evaluationWorking}/>:tab==='calendario'?<PortalCalendar arts={arts}/>:<PortalArts arts={arts} tab={tab} today={today} onDecision={submitArtDecision} working={working} error={actionError}/>}</>}<footer className="clientPortalFooter">Acesso privado do cliente · Avesso</footer></main>;
}
