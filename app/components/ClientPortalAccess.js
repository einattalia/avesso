'use client';
import {useState} from 'react';
import {fileApi} from '../../lib/r2-client';

export default function ClientPortalAccess({client,supabase}){
  const [open,setOpen]=useState(false),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function run(action){
    setBusy(true);setError('');setMessage('');
    try{
      const result=await fileApi(supabase,{action,clientId:client.id},'/api/client-portal');
      if(action==='issue'){
        setUrl(result.url);
        try{await navigator.clipboard.writeText(result.url);setMessage('Novo link gerado e copiado. O link anterior foi renovado.')}
        catch{setMessage('Novo link gerado. Copie o endereço abaixo para enviar ao cliente.')}
      }else{setUrl('');setMessage('Acesso do portal revogado.')}
    }catch(e){setError(e.message||'Não foi possível atualizar o acesso.')}
    finally{setBusy(false)}
  }
  return <div className="clientPortalAccess"><button type="button" className="secondary" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>Portal do cliente</button>{open&&<section className="portalAccessPanel" aria-label="Acesso ao portal do cliente"><strong>Acesso sem login</strong><p>O link dá acesso às artes aprovadas, agendadas e entregues deste cliente. Ao gerar outro, o link anterior deixa de funcionar.</p>{url&&<label>Link do portal<input readOnly value={url} onFocus={event=>event.target.select()}/></label>}{error&&<p className="loginError" role="alert">{error}</p>}{message&&<p className="saveMsg" role="status">{message}</p>}<div className="portalAccessActions"><button type="button" className="primary" disabled={busy} onClick={()=>run('issue')}>{busy?'Atualizando...':url?'Gerar novo link':'Gerar link do portal'}</button>{url&&<button type="button" className="secondary" disabled={busy} onClick={async()=>{try{await navigator.clipboard.writeText(url);setMessage('Link copiado.')}catch{setMessage('Selecione e copie o link acima.')}}}>Copiar link</button>}<button type="button" className="secondary" disabled={busy} onClick={()=>run('revoke')}>Revogar acesso</button></div></section>}</div>;
}
