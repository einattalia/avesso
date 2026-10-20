'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Bell,Check,ExternalLink} from 'lucide-react';

function eventLabel(status,clientSide){
 if(status==='with_client')return clientSide?'Nova arte aguardando sua aprovação':'Arte enviada ao cliente para aprovação';
 if(status==='approved')return clientSide?'Sua aprovação foi registrada':'Cliente aprovou uma arte';
 if(status==='adjustments')return clientSide?'A equipe recebeu seu pedido de ajuste':'Cliente pediu ajustes em uma arte';
 return 'Atualização de arte';
}
function timeLabel(value){return value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):''}

export default function NotificationBell({organizationId,clientId,portalToken,supabase,onOpen}){
 const [events,setEvents]=useState([]),[open,setOpen]=useState(false),[read,setRead]=useState([]),[error,setError]=useState('');
 const storageKey=useMemo(()=>`avesso-notifications:${portalToken?'portal-'+portalToken:organizationId+'-'+(clientId||'agency')}`,[portalToken,organizationId,clientId]);
 useEffect(()=>{try{setRead(JSON.parse(localStorage.getItem(storageKey)||'[]'))}catch{setRead([])}},[storageKey]);
 const load=useCallback(async()=>{
  if(!portalToken&&!organizationId)return;
  try{
   let response;
   if(portalToken)response=await fetch(`/api/client-portal/${encodeURIComponent(portalToken)}?view=notifications`,{cache:'no-store'});
   else{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.access_token)return;
    const query=new URLSearchParams({organizationId});if(clientId)query.set('clientId',clientId);
    response=await fetch(`/api/agency-notifications?${query}`,{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});
   }
   const body=await response.json();if(!response.ok)throw new Error(body.error||'Não foi possível carregar as notificações.');
   setEvents(body.events||[]);setError('');
  }catch(e){setError(e.message||'Não foi possível carregar as notificações.')}
 },[portalToken,organizationId,clientId,supabase]);
 useEffect(()=>{load();const timer=setInterval(load,30000);return()=>clearInterval(timer)},[load]);
 const unread=events.filter(event=>!read.includes(event.id)).length;
 function markRead(id){const next=id?[...new Set([...read,id])]:events.map(event=>event.id);setRead(next);try{localStorage.setItem(storageKey,JSON.stringify(next.slice(-500)))}catch{}}
 return <div className="notificationBellWrap">
  <button type="button" className="notificationBellButton" aria-label={unread?`Notificações, ${unread} não lidas`:'Notificações'} aria-expanded={open} onClick={()=>{setOpen(value=>!value);if(!open)load()}}><Bell size={19}/>{unread>0&&<span className="notificationBellCount">{unread>99?'99+':unread}</span>}</button>
  {open&&<><button className="notificationBellBackdrop" aria-label="Fechar notificações" onClick={()=>setOpen(false)}/><section className="notificationBellPanel" aria-label="Notificações salvas"><header><div><small>ATUALIZAÇÕES</small><h2>Notificações</h2></div><button type="button" onClick={()=>markRead(null)} disabled={!unread}><Check size={14}/>Marcar lidas</button></header>{error&&<p className="notificationBellError">{error}</p>}{!events.length&&!error?<p className="notificationBellEmpty">Nenhuma notificação por enquanto.</p>:<div className="notificationBellList">{events.map(event=><button type="button" key={event.id} className={'notificationBellItem'+(read.includes(event.id)?' isRead':'')} onClick={()=>{markRead(event.id);setOpen(false);onOpen?.(event)}}><span className="notificationBellDot"/><span><strong>{eventLabel(event.status,!!portalToken)}</strong><b>{event.title||'Arte'}</b>{event.clientName&&<small>{event.clientName}</small>}<small>{timeLabel(event.createdAt)}</small></span><ExternalLink size={14}/></button>)}</div>}</section></>}
 </div>
}
