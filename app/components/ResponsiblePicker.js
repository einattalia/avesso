'use client';
import {useEffect,useState} from 'react';
import {teamApi} from '../../lib/team-client';
export default function ResponsiblePicker({supabase,contractId,item,team,assignments,onSaved}) {
  const sourceIds=item._sourceIds||[item.id];
  const stored=[...new Set(assignments.filter(a=>sourceIds.includes(a.contract_item_id)).flatMap(a=>a.team_member_ids||[]))];
  const signature=[...stored].sort().join(',');
  const [selected,setSelected]=useState(stored),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  useEffect(()=>{setSelected(signature?signature.split(','):[])},[signature,item.id]);
  async function save(){setBusy(true);setError('');setMessage('');try{await teamApi(supabase,{action:'assign',contractId,itemIds:sourceIds,memberIds:selected});onSaved(sourceIds,selected);setMessage('Responsáveis salvos.')}catch(e){setError(e.message)}finally{setBusy(false)}}
  return <div className="responsiblePicker"><details><summary>{selected.length?`${selected.length} responsável(is)`:'Selecionar equipe'}</summary>{[['designer','Designers'],['videomaker','Videomakers']].map(([role,label])=><fieldset key={role}><legend>{label}</legend>{team.filter(m=>m.role===role&&(m.is_active||selected.includes(m.id))).map(m=><label key={m.id}><input type="checkbox" checked={selected.includes(m.id)} onChange={e=>{setSelected(ids=>e.target.checked?[...ids,m.id]:ids.filter(id=>id!==m.id));setMessage('')}}/>{m.name}{!m.is_active?' (inativo)':''}</label>)}{!team.some(m=>m.role===role&&m.is_active)&&<small>Nenhuma pessoa ativa nesta função.</small>}</fieldset>)}<button type="button" className="secondary" disabled={busy} onClick={save}>{busy?'Salvando...':'Salvar responsáveis'}</button></details>{message&&<small role="status">{message}</small>}{error&&<small className="loginError" role="alert">{error}</small>}</div>;
}
