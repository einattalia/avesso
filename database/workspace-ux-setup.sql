-- AVESSO Cliente 360 / UX. Execute após briefing-production-setup.sql.
-- Alterações aditivas: preserva todos os documentos e versões existentes.
begin;
create table if not exists public.client_materials (
 id uuid primary key default gen_random_uuid(),client_id uuid not null references public.clients(id),
 section text not null check(section in ('references','branding')),title text not null,body text not null default '',
 link text not null default '',category text not null default 'Ideia',state text not null default 'Para avaliar',shared boolean not null default false,
 author_id uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.client_material_history (
 id uuid primary key default gen_random_uuid(),material_id uuid not null references public.client_materials(id),snapshot jsonb not null,created_at timestamptz not null default now()
);
create table if not exists public.client_notes (
 id uuid primary key default gen_random_uuid(),client_id uuid not null references public.clients(id),subject_id uuid not null,subject_type text not null check(subject_type in ('material','version')),
 body text not null check(length(body)>0 and length(body)<=20000),author_id uuid not null references auth.users(id),author_name text not null,created_at timestamptz not null default now()
);
create table if not exists public.client_assets (
 id uuid primary key,client_id uuid not null references public.clients(id),subject_id uuid not null,subject_type text not null check(subject_type in ('material','version')),
 file_name text not null,mime_type text not null,file_size bigint not null check(file_size>0 and file_size<=104857600),
 bucket text not null,object_key text not null unique,author_id uuid not null references auth.users(id),purpose text not null default 'reference' check(purpose in ('reference','slide')),
 ready boolean not null default false,created_at timestamptz not null default now()
);
alter table public.client_materials enable row level security;
alter table public.client_material_history enable row level security;
alter table public.client_notes enable row level security;
alter table public.client_assets enable row level security;
revoke all on public.client_materials,public.client_material_history,public.client_notes,public.client_assets from public,anon,authenticated;
grant select,insert,update,delete on public.client_materials,public.client_material_history,public.client_notes,public.client_assets to service_role;
create index if not exists client_materials_client_section on public.client_materials(client_id,section,updated_at desc);
create index if not exists client_notes_subject on public.client_notes(subject_id,created_at);
create index if not exists client_assets_subject on public.client_assets(subject_id,ready,created_at);
create or replace function public.avesso_material_history() returns trigger language plpgsql security invoker set search_path='' as $$
begin insert into public.client_material_history(material_id,snapshot) values(old.id,to_jsonb(old));return new;end;$$;
drop trigger if exists save_material_history on public.client_materials;
create trigger save_material_history before update on public.client_materials for each row execute function public.avesso_material_history();
alter table public.demands add column if not exists reference_id uuid references public.client_materials(id);
alter table public.demand_versions add column if not exists caption text not null default '';
alter table public.recording_sessions alter column client_id drop not null;
alter table public.recording_sessions add column if not exists kind text not null default 'recording' check(kind in ('recording','meeting','post','block'));
alter table public.recording_sessions add column if not exists member_ids uuid[] not null default '{}';
alter table public.recording_sessions add column if not exists buffer_before integer not null default 0 check(buffer_before between 0 and 1440);
alter table public.recording_sessions add column if not exists buffer_after integer not null default 0 check(buffer_after between 0 and 1440);
alter table public.recording_sessions add column if not exists shared boolean not null default true;
-- O cliente só pode consultar eventos compartilhados de seu próprio espaço.
drop policy if exists recording_sessions_select on public.recording_sessions;
create policy recording_sessions_select on public.recording_sessions for select to authenticated using (
 public.is_super_admin() or public.has_org_role(organization_id,array['agency_owner','agency_admin','team_member']::public.app_role[])
 or (shared and kind<>'block' and private.user_has_client_access(client_id))
);
create or replace function public.avesso_save_calendar_event(actor uuid,org uuid,event_id uuid,customer uuid,payload jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare eid uuid:=coalesce(event_id,gen_random_uuid()); members uuid[]; a timestamptz; b timestamptz; bf integer; af integer; conflict public.recording_sessions;
begin
 if not exists(select 1 from public.organization_members where organization_id=org and user_id=actor and is_active and role<>'client_user') then raise exception 'Permission denied';end if;
 -- Serializa reservas concorrentes da mesma organização antes de verificar conflitos.
 perform pg_advisory_xact_lock(hashtextextended(org::text,73012));
 if customer is not null and not exists(select 1 from public.clients where id=customer and organization_id=org) then raise exception 'Invalid client';end if;
 if event_id is not null and not exists(select 1 from public.recording_sessions where id=event_id and organization_id=org) then raise exception 'Event unavailable';end if;
 select coalesce(array_agg(value::uuid),'{}'::uuid[]) into members from jsonb_array_elements_text(payload->'member_ids');
 if exists(select 1 from unnest(members) x where not exists(select 1 from public.agency_team_members t where t.id=x and t.organization_id=org and t.is_active)) then raise exception 'Invalid team';end if;
 a=(payload->>'starts_at')::timestamptz;b=(payload->>'ends_at')::timestamptz;bf=(payload->>'buffer_before')::integer;af=(payload->>'buffer_after')::integer;
 if a is null or b is null or b<=a or bf not between 0 and 1440 or af not between 0 and 1440 then raise exception 'Invalid period';end if;
 if payload->>'kind'<>'post' and payload->>'status'<>'cancelled' then
  select * into conflict from public.recording_sessions e where e.organization_id=org and e.id<>eid and e.kind<>'post' and e.status<>'cancelled'
   and (cardinality(members)=0 or cardinality(e.member_ids)=0 or e.member_ids&&members)
   and e.starts_at-make_interval(mins=>e.buffer_before)<b+make_interval(mins=>af)
   and e.ends_at+make_interval(mins=>e.buffer_after)>a-make_interval(mins=>bf) limit 1;
  if found then raise exception 'Conflito: % em % até %.',coalesce(conflict.title,'Compromisso'),to_char(conflict.starts_at at time zone 'America/Sao_Paulo','DD/MM HH24:MI'),to_char(conflict.ends_at at time zone 'America/Sao_Paulo','DD/MM HH24:MI');end if;
 end if;
 insert into public.recording_sessions(id,organization_id,client_id,title,starts_at,ends_at,kind,member_ids,buffer_before,buffer_after,shared,location,notes,status,created_by)
 values(eid,org,customer,payload->>'title',a,b,payload->>'kind',members,bf,af,case when payload->>'kind'='block' then false else (payload->>'shared')::boolean end,payload->>'location',payload->>'notes',payload->>'status',actor)
 on conflict(id) do update set client_id=excluded.client_id,title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at,kind=excluded.kind,member_ids=excluded.member_ids,buffer_before=excluded.buffer_before,buffer_after=excluded.buffer_after,shared=excluded.shared,location=excluded.location,notes=excluded.notes,status=excluded.status,updated_at=now();
 return eid;
end;$$;
revoke all on function public.avesso_save_calendar_event(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.avesso_save_calendar_event(uuid,uuid,uuid,uuid,jsonb) to service_role;
create or replace function public.avesso_review_with_note(target_demand uuid,target_version uuid,actor_id uuid,decision text,note text)
returns text language plpgsql security invoker set search_path='' as $$
declare result text; v public.demand_versions;d public.demands;
begin
 if decision not in ('approve','changes') then raise exception 'Invalid decision';end if;
 if decision='changes' and length(trim(coalesce(note,'')))=0 then raise exception 'Descreva os ajustes necessários.';end if;
 if length(note)>20000 then raise exception 'Texto muito longo';end if;
 select * into d from public.demands where id=target_demand for update;
 select * into v from public.demand_versions where id=target_version and demand_id=target_demand for update;
 if not found or v.status<>'sent_for_review' or d.status<>'with_client' then raise exception 'Esta versão não está mais aguardando aprovação.';end if;
 result=public.avesso_production_action(target_demand,target_version,actor_id,decision,null);
 if length(trim(coalesce(note,'')))>0 then
  insert into public.client_notes(client_id,subject_id,subject_type,body,author_id,author_name) values(d.client_id,target_version,'version',trim(note),actor_id,'Cliente');
  update public.approval_events set note=trim(avesso_review_with_note.note) where demand_version_id=target_version and user_id=actor_id and event=case when decision='approve' then 'approved' else 'changes_requested' end;
 end if;
 return result;
end;$$;
revoke all on function public.avesso_review_with_note(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.avesso_review_with_note(uuid,uuid,uuid,text,text) to service_role;
create or replace function public.avesso_reference_to_content(actor uuid,reference uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.client_materials;org uuid;did uuid;
begin
 select * into r from public.client_materials where id=reference and section='references' for update;
 if not found then raise exception 'Unavailable';end if;
 select organization_id into org from public.clients where id=r.client_id;
 if not exists(select 1 from public.organization_members where organization_id=org and user_id=actor and is_active and role<>'client_user') then raise exception 'Permission denied';end if;
 select id into did from public.demands where reference_id=r.id limit 1;
 if did is not null then return did;end if;
 insert into public.demands(client_id,organization_id,title,type,briefing,status,reference_id)
 values(r.client_id,org,r.title,'Criativos',r.body||E'\n'||r.link,'in_production',r.id) returning id into did;
 update public.client_materials set state='Selecionada',updated_at=now() where id=r.id;return did;
end;$$;
create or replace function public.avesso_finish_workspace_asset(asset uuid,actor uuid,final_key text)
returns void language plpgsql security invoker set search_path='' as $$
declare f public.client_assets;v public.demand_versions;
begin
 select * into f from public.client_assets where id=asset and author_id=actor for update;
 if not found then raise exception 'Unavailable';end if;
 if f.ready then return;end if;
 if f.purpose='slide' then
  select * into v from public.demand_versions where id=f.subject_id for update;
  if not found or v.status<>'draft' then raise exception 'Version already shared';end if;
 end if;
 update public.client_assets set object_key=final_key,ready=true where id=asset;
end;$$;
revoke all on function public.avesso_reference_to_content(uuid,uuid),public.avesso_finish_workspace_asset(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.avesso_reference_to_content(uuid,uuid),public.avesso_finish_workspace_asset(uuid,uuid,text) to service_role;
commit;
