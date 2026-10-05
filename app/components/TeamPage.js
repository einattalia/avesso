'use client';
import {useEffect,useState} from 'react';
import {Plus,Save,Pencil} from 'lucide-react';
import {teamApi} from '../../lib/team-client';
export default function TeamPage({ctx,supabase}) {
  const [team,setTeam]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[edit,setEdit]=useState(null),[form,setForm]=useState({name:'',role:'designer',active:true});
  const org=ctx.organization.id;
  async function load(){const data=await teamApi(supabase,{action:'list',organizationId:org});setTeam(data.team)}
  useEffect(()=>{let active=true;teamApi(supabase,{action:'list',organizationId:org}).then(data=>{if(active)setTeam(data.team)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[org,supabase]);
  async function save(e){e.preventDefault();setBusy(true);setError('');setMessage('');try{await teamApi(supabase,{action:edit?'update':'create',organizationId:org,memberId:edit,...form});await load();setEdit(null);setForm({name:'',role:'designer',active:true});setMessage('Equipe salva.')}catch(e){setError(e.message)}finally{setBusy(false)}}
  return <section className="module teamModule"><div className="sectionHead"><div><small>EQUIPE DA AGÊNCIA</small><h2>Designers e videomakers</h2><p>Cadastre quem produz as entregas dos clientes.</p></div></div>
    <form className="teamForm" onSubmit={save}><label>Nome<input required maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Função<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="designer">Designer</option><option value="videomaker">Videomaker</option></select></label>{edit&&<label>Status<select value={String(form.active)} onChange={e=>setForm({...form,active:e.target.value==='true'})}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>}<button className="primary" disabled={busy}>{edit?<Save size={16}/>:<Plus size={16}/>} {busy?'Salvando...':edit?'Salvar pessoa':'Adicionar pessoa'}</button>{edit&&<button type="button" className="secondary" onClick={()=>{setEdit(null);setForm({name:'',role:'designer',active:true})}}>Cancelar edição</button>}</form>
    {error&&<div className="loginError" role="alert">{error}</div>}{message&&<div className="saveMsg" role="status">{message}</div>}
    {loading?<p>Carregando equipe...</p>:<div className="teamColumns">{[['designer','Designers'],['videomaker','Videomakers']].map(([role,label])=><section key={role}><h3>{label}</h3>{team.filter(m=>m.role===role).map(m=><article className="teamPerson" key={m.id}><div><strong>{m.name}</strong><small>{m.is_active?'Ativo':'Inativo'}</small></div><button type="button" className="secondary" aria-label={`Editar ${m.name}`} onClick={()=>{setEdit(m.id);setForm({name:m.name,role:m.role,active:m.is_active})}}><Pencil size={15}/> Editar</button></article>)}{!team.some(m=>m.role===role)&&<p>Nenhuma pessoa cadastrada nesta função.</p>}</section>)}</div>}
    <p className="ruleNote">O cadastro identifica os responsáveis pelas entregas. Os acessos de login continuam sendo administrados no Supabase.</p>
  </section>;
}
