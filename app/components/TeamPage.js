'use client';
import {useEffect,useState} from 'react';
import {Plus,Save,Pencil} from 'lucide-react';
import {teamApi} from '../../lib/team-client';
import {ProfileImageField,PrivateProfileImage} from './ProfileImages';
import {uploadPrivateProfileImage} from '../../lib/profile-media';

const emptyForm={name:'',role:'designer',active:true,photoPath:''};
const roleOptions=[['designer','Designer'],['videomaker','Videomaker'],['paid_media','Tráfego pago']];
export default function TeamPage({ctx,supabase}) {
  const [team,setTeam]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[edit,setEdit]=useState(null),[form,setForm]=useState(emptyForm),[photoFile,setPhotoFile]=useState(null);
  const org=ctx.organization.id;
  async function load(){const data=await teamApi(supabase,{action:'list',organizationId:org});setTeam(data.team)}
  useEffect(()=>{let active=true;teamApi(supabase,{action:'list',organizationId:org}).then(data=>{if(active)setTeam(data.team)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[org,supabase]);
  async function save(e){e.preventDefault();setBusy(true);setError('');setMessage('');try{let photoPath=form.photoPath||null;if(photoFile)photoPath=await uploadPrivateProfileImage(supabase,photoFile,org,'team',edit||'new');await teamApi(supabase,{action:edit?'update':'create',organizationId:org,memberId:edit,...form,photoPath});await load();setEdit(null);setForm(emptyForm);setPhotoFile(null);setMessage('Equipe salva.')}catch(e){setError(e.message)}finally{setBusy(false)}}
  return <section className="module teamModule"><div className="sectionHead"><div><small>EQUIPE DA AGÊNCIA</small><h2>Equipe da agência</h2><p>Cadastre as pessoas que produzem e acompanham as entregas dos clientes.</p></div></div>
    <form className="teamForm" onSubmit={save}><label>Nome<input required maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Função<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{roleOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{edit&&<label>Status<select value={String(form.active)} onChange={e=>setForm({...form,active:e.target.value==='true'})}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>}<ProfileImageField supabase={supabase} path={form.photoPath} onFileChange={setPhotoFile} label="Foto da pessoa" action={<button className="primary" disabled={busy}>{edit?<Save size={16}/>:<Plus size={16}/>} {busy?'Salvando...':edit?'Salvar pessoa':'Adicionar pessoa'}</button>}/>{edit&&<button type="button" className="secondary" onClick={()=>{setEdit(null);setForm(emptyForm);setPhotoFile(null)}}>Cancelar edição</button>}</form>
    {error&&<div className="loginError" role="alert">{error}</div>}{message&&<div className="saveMsg" role="status">{message}</div>}
    {loading?<p>Carregando equipe...</p>:<div className="teamColumns">{roleOptions.map(([role,label])=><section key={role}><h3>{label}</h3>{team.filter(m=>m.role===role).map(m=><article className="teamPerson" key={m.id}><PrivateProfileImage supabase={supabase} path={m.photo_path} name={m.name} className="profileAvatar" fallbackClassName="profileAvatarFallback"/><div className="teamPersonInfo"><strong>{m.name}</strong><small>{m.is_active?'Ativo':'Inativo'}</small></div><button type="button" className="secondary" aria-label={`Editar ${m.name}`} onClick={()=>{setEdit(m.id);setForm({name:m.name,role:m.role,active:m.is_active,photoPath:m.photo_path||''});setPhotoFile(null)}}><Pencil size={15}/> Editar</button></article>)}{!team.some(m=>m.role===role)&&<p>Nenhuma pessoa cadastrada nesta função.</p>}</section>)}</div>}
    <p className="ruleNote">O cadastro identifica os responsáveis pelas entregas. Os acessos de login continuam sendo administrados no Supabase.</p>
  </section>;
}
