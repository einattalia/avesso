'use client';
import {useCallback,useEffect,useState} from 'react';
import {Instagram,LoaderCircle,Unplug} from 'lucide-react';

export default function InstagramConnectionButton({supabase,client}){
 const [connection,setConnection]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const request=useCallback(async(method,body={})=>{
  const {data,error:sessionError}=await supabase.auth.getSession();
  if(sessionError||!data.session?.access_token)throw new Error('Sua sessão expirou. Entre novamente.');
  const response=await fetch('/api/instagram'+(method==='GET'?'?clientId='+encodeURIComponent(client.id):''),{
   method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},
   ...(method==='GET'?{}:{body:JSON.stringify({...body,clientId:client.id})}),cache:'no-store'
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'Não foi possível acessar a conexão do Instagram.');
  return result;
 },[client.id,supabase]);
 const load=useCallback(async()=>{try{const result=await request('GET');setConnection(result.connection||null)}catch(e){setError(e.message)}},[request]);
 useEffect(()=>{load()},[load]);
 useEffect(()=>{
  function onMessage(event){
   if(event.origin!==window.location.origin||event.data?.type!=='avesso-instagram-connection'||event.data.clientId!==client.id)return;
   setBusy(false);setError(event.data.error||'');setMessage(event.data.connected?'Instagram conectado com sucesso.':'');
   if(event.data.connected)load();
  }
  window.addEventListener('message',onMessage);
  return()=>window.removeEventListener('message',onMessage);
 },[client.id,load]);
 async function connect(){
  setBusy(true);setError('');setMessage('');
  const popup=window.open('about:blank','avesso-instagram-connect','popup,width=560,height=760');
  if(!popup){setBusy(false);setError('Permita a abertura da janela de autorização do Instagram e tente novamente.');return}
  try{const result=await request('POST',{action:'connect'});popup.location.href=result.url}
  catch(e){popup.close();setBusy(false);setError(e.message)}
 }
 async function disconnect(){
  if(!window.confirm('Desconectar o Instagram deste cliente? O Avesso deixará de acessar as métricas da conta.'))return;
  setBusy(true);setError('');setMessage('');
  try{await request('DELETE');setConnection(null);setMessage('Instagram desconectado.')}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const expired=connection?.token_expires_at&&new Date(connection.token_expires_at).getTime()<Date.now();
 return <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
  <button type="button" className="secondary" onClick={connect} disabled={busy}>
   {busy?<LoaderCircle size={15} className="spin"/>:<Instagram size={15}/>}
   {busy?'Conectando…':connection?(expired?'Reconectar Instagram':'Instagram conectado'):'Conectar Instagram'}
  </button>
  {connection&&!expired&&<span style={{fontSize:12,color:'var(--muted,#667085)'}}>@{connection.username}{connection.account_type?' · '+connection.account_type.toLowerCase().replace('_',' '):''}</span>}
  {connection&&<button type="button" className="secondary" aria-label="Desconectar Instagram" title="Desconectar Instagram" onClick={disconnect} disabled={busy}><Unplug size={14}/></button>}
  {error&&<span role="alert" style={{width:'100%',fontSize:12,color:'var(--danger,#b42318)'}}>{error}</span>}
  {message&&<span role="status" style={{width:'100%',fontSize:12,color:'var(--success,#067647)'}}>{message}</span>}
 </div>;
}
