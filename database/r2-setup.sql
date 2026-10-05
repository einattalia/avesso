-- Execute once in the existing project's Supabase SQL Editor, before deploying.
-- This extends the existing AVESSO schema; it does not recreate business tables or their RLS.
begin;
alter table public.demand_versions add column if not exists storage_provider text not null default 'supabase';
-- Ensure multi-GB sizes also fit when the original column was a 32-bit integer.
alter table public.demand_versions alter column file_size type bigint using file_size::bigint;
create unique index if not exists demand_versions_r2_path_unique on public.demand_versions(storage_path) where storage_provider='r2';

create table if not exists public.r2_upload_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  demand_id uuid not null references public.demands(id),
  object_key text not null unique,
  bucket text not null,
  upload_id text not null,
  file_name text not null,
  file_size bigint not null check(file_size>0),
  mime_type text not null,
  fingerprint text not null,
  part_size integer not null,
  state text not null default 'pending' check(state in ('pending','completed','aborted')),
  version_number integer,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '6 days'
);
alter table public.r2_upload_sessions enable row level security;
-- Only the server can write trusted upload metadata; browser users have no access.
revoke all on public.r2_upload_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.r2_upload_sessions to service_role;
create index if not exists r2_upload_sessions_owner on public.r2_upload_sessions(user_id,state,expires_at);

create or replace function public.avesso_finalize_r2_upload(session_id uuid,actor_id uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare s public.r2_upload_sessions; d public.demands; n integer;
begin
  select * into s from public.r2_upload_sessions where id=session_id and user_id=actor_id for update;
  if not found then raise exception 'Upload unavailable'; end if;
  select * into d from public.demands where id=s.demand_id for update;
  if not found or not exists (
    select 1 from public.organization_members m where m.organization_id=d.organization_id
      and m.user_id=actor_id and m.is_active=true and m.role<>'client_user'
  ) then raise exception 'Permission denied'; end if;
  if s.state='completed' then return s.version_number; end if;
  if s.state<>'pending' or s.expires_at<=now() then raise exception 'Upload expired'; end if;
  select coalesce(max(version_number),0)+1 into n from public.demand_versions where demand_id=s.demand_id;
  insert into public.demand_versions(demand_id,version_number,storage_path,storage_provider,file_name,mime_type,file_size,uploaded_by,status)
    values(s.demand_id,n,s.object_key,'r2',s.file_name,s.mime_type,s.file_size,actor_id,'draft');
  update public.demands set status='internal_review' where id=s.demand_id;
  update public.r2_upload_sessions set state='completed',version_number=n where id=s.id;
  return n;
end;
$$;
revoke all on function public.avesso_finalize_r2_upload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.avesso_finalize_r2_upload(uuid,uuid) to service_role;
commit;
