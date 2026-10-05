'use client';
import {useEffect,useRef,useState} from 'react';
import {FileText,Paperclip,Save} from 'lucide-react';
import {fileApi,uploadContract,discardProduction} from '../../lib/r2-client';

export default function ContractDocuments({contractId,supabase}) {
  const [content,setContent]=useState(''),[files,setFiles]=useState([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[uploading,setUploading]=useState(false),[progress,setProgress]=useState(0),[pending,setPending]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[dirty,setDirty]=useState(false),[savedAt,setSavedAt]=useState(null);
  const controller=useRef(null),textRef=useRef('');
  const [ready,setReady]=useState(false),[reload,setReload]=useState(0);
  useEffect(()=>{
    let active=true;setLoading(true);setReady(false);setError('');setFiles([]);setContent('');textRef.current='';setDirty(false);setSavedAt(null);
    fileApi(supabase,{scope:'contract',action:'list',contractId}).then(data=>{
      if(!active)return;setFiles(data.files);setContent(data.content);textRef.current=data.content;setSavedAt(data.updatedAt);setReady(true);
    }).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false;controller.current?.abort()};
  },[contractId,supabase,reload]);
  async function saveText() {
    const submitted=content;setSaving(true);setError('');setMessage('');
    try {
      const result=await fileApi(supabase,{scope:'contract',action:'saveText',contractId,content:submitted});
      setSavedAt(result.updatedAt);setDirty(textRef.current!==submitted);setMessage('Texto do contrato salvo.');
    }catch(e){setError(e.message)}finally{setSaving(false)}
  }
  async function upload(e) {
    const input=e.target,file=input.files?.[0];if(!file)return;
    const abort=new AbortController();controller.current=abort;setUploading(true);setError('');setMessage('');setProgress(0);
    try {
      await uploadContract(supabase,contractId,file,setProgress,abort.signal,setPending);
      const data=await fileApi(supabase,{scope:'contract',action:'list',contractId});setFiles(data.files);setMessage('Anexo salvo no contrato.');
    }catch(e){setError(e.message)}finally{setUploading(false);controller.current=null;input.value=''}
  }
  async function open(file) {
    const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;
    setError('');
    try {
      const {url}=await fileApi(supabase,{scope:'contract',action:'read',contractId,fileId:file.id});
      if(tab)tab.location.href=url;else window.location.assign(url);
    }catch(e){tab?.close();setError(e.message)}
  }
  return <section className="contractDocuments">
    <div className="sectionHead"><div><small>DOCUMENTO DO CLIENTE</small><h3>Texto do contrato</h3><p>Preencha as cláusulas, condições e acordos deste contrato.</p></div><button type="button" className="primary" onClick={saveText} disabled={!ready||saving}><Save size={16}/>{saving?'Salvando...':'Salvar texto'}</button></div>
    <label className="contractTextLabel">Conteúdo do contrato<textarea className="contractText" rows={12} maxLength={100000} disabled={!ready} value={content} placeholder="Digite ou cole aqui o texto do contrato..." onChange={e=>{setContent(e.target.value);textRef.current=e.target.value;setDirty(true);setMessage('')}}/></label>
    <p className="contractSaveState" role="status">{loading?'Carregando documento...':dirty?'Há alterações no texto que ainda não foram salvas.':savedAt?`Último salvamento: ${new Date(savedAt).toLocaleString('pt-BR')}`:'O texto ainda não foi salvo.'}</p>
    <div className="sectionHead"><div><small>ANEXOS PRIVADOS</small><h3>Arquivos do contrato</h3><p>PDF, DOC, DOCX, JPG ou PNG, até 100 MB por arquivo.</p></div><label className="primary uploadBtn"><Paperclip size={16}/>{uploading?`Enviando ${progress}%`:'Anexar arquivo'}<input aria-label="Anexar arquivo ao contrato" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" disabled={!ready||uploading} onChange={upload}/></label></div>
    {uploading&&<button type="button" className="secondary" onClick={()=>controller.current?.abort()}>Pausar envio</button>}
    {!uploading&&pending&&<button type="button" className="secondary" onClick={async()=>{try{await discardProduction(supabase,pending);setPending(null);setMessage('Envio pendente descartado.')}catch(e){setError(e.message)}}}>Descartar envio pendente</button>}
    {files.length?<ul className="contractFileList">{files.map(file=><li key={file.id}><FileText size={22}/><div><strong>{file.file_name}</strong><small>{(Number(file.file_size)/1048576).toFixed(1)} MB · {new Date(file.created_at).toLocaleDateString('pt-BR')}</small></div><button type="button" className="secondary" onClick={()=>open(file)}>Abrir / baixar</button></li>)}</ul>:!loading&&<p>Nenhum arquivo anexado a este contrato.</p>}
    {error&&<div className="loginError" role="alert">{error}</div>}{message&&<div className="saveMsg" role="status">{message}</div>}
    {!loading&&!ready&&<button type="button" className="secondary" onClick={()=>setReload(n=>n+1)}>Tentar carregar novamente</button>}
  </section>;
}
