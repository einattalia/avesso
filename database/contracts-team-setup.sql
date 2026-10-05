-- Run in the Supabase SQL Editor after r2-setup.sql, before deploying this version.
begin;
create table if not exists public.contract_documents (
  contract_id uuid primary key references public.contracts(id),
  content text not null default '' check(length(content)<=100000),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.contract_files (
  id uuid primary key,
  contract_id uuid not null references public.contracts(id),
  storage_path text not null unique,
  bucket text not null,
  file_name text not null,
  file_size bigint not null check(file_size>0),
  mime_type text not null,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.contract_upload_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  contract_id uuid not null references public.contracts(id),
  object_key text not null unique,
  bucket text not null,
  upload_id text not null,
  file_name text not null,
  file_size bigint not null check(file_size>0 and file_size<=104857600),
  mime_type text not null,
  fingerprint text not null,
  part_size integer not null,
  state text not null default 'pending' check(state in ('pending','completed','aborted')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '6 days'
);
alter table public.contract_documents enable row level security;
alter table public.contract_files enable row level security;
alter table public.contract_upload_sessions enable row level security;
revoke all on public.contract_documents,public.contract_files,public.contract_upload_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.contract_documents,public.contract_files,public.contract_upload_sessions to service_role;
create index if not exists contract_files_by_contract on public.contract_files(contract_id,created_at);
create index if not exists contract_upload_owner on public.contract_upload_sessions(user_id,state,expires_at);

create or replace function public.avesso_finalize_contract_upload(session_id uuid,actor_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare s public.contract_upload_sessions; c public.contracts;
begin
  select * into s from public.contract_upload_sessions where id=session_id and user_id=actor_id for update;
  if not found then raise exception 'Upload unavailable'; end if;
  select * into c from public.contracts where id=s.contract_id for update;
  if not found or not exists (
    select 1 from public.organization_members m where m.organization_id=c.organization_id
      and m.user_id=actor_id and m.is_active=true and m.role<>'client_user'
  ) then raise exception 'Permission denied'; end if;
  if s.state='completed' then return s.id; end if;
  if s.state<>'pending' or s.expires_at<=now() then raise exception 'Upload expired'; end if;
  insert into public.contract_files(id,contract_id,storage_path,bucket,file_name,file_size,mime_type,uploaded_by)
    values(s.id,s.contract_id,s.object_key,s.bucket,s.file_name,s.file_size,s.mime_type,actor_id);
  update public.contract_upload_sessions set state='completed' where id=s.id;
  return s.id;
end;
$$;
revoke all on function public.avesso_finalize_contract_upload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.avesso_finalize_contract_upload(uuid,uuid) to service_role;
-- Team roster and responsibilities on contracted deliverables.
create table if not exists public.agency_team_members (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 name text not null check(length(trim(name)) between 1 and 120),
 role text not null check(role in ('designer','videomaker')),
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.contract_items add column if not exists merged_into uuid references public.contract_items(id);
create table if not exists public.contract_item_assignments (
 contract_item_id uuid primary key references public.contract_items(id) on delete cascade,
 contract_id uuid not null references public.contracts(id),
 team_member_ids uuid[] not null default '{}',
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now()
);
create table if not exists public.contract_arts_merges (
 id uuid primary key default gen_random_uuid(),
 contract_id uuid not null references public.contracts(id),
 actor_id uuid not null references auth.users(id),
 main_item_id uuid not null,
 previous_items jsonb not null,
 previous_assignments jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.agency_team_members enable row level security;
alter table public.contract_item_assignments enable row level security;
alter table public.contract_arts_merges enable row level security;
revoke all on public.agency_team_members,public.contract_item_assignments,public.contract_arts_merges from public,anon,authenticated;
grant select,insert,update,delete on public.agency_team_members,public.contract_item_assignments,public.contract_arts_merges to service_role;
create index if not exists agency_team_by_org on public.agency_team_members(organization_id,role);
create index if not exists assignment_by_contract on public.contract_item_assignments(contract_id);
create or replace function public.avesso_merge_contract_arts(target_contract uuid,actor_id uuid,art_ids uuid[],main_id uuid,quantity integer,extra_price numeric,active boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.contracts; n integer; members uuid[];
begin
 select * into c from public.contracts where id=target_contract for update;
 if not found or not exists (
  select 1 from public.organization_members m where m.organization_id=c.organization_id
  and m.user_id=actor_id and m.is_active=true and m.role<>'client_user'
 ) then raise exception 'Permission denied'; end if;
 if art_ids is null or cardinality(art_ids)=0 or not (main_id=any(art_ids)) then raise exception 'Invalid items'; end if;
 if quantity<0 or extra_price<0 then raise exception 'Invalid values'; end if;
 perform 1 from public.contract_items where contract_id=target_contract and id=any(art_ids) and merged_into is null for update;
 select count(*) into n from public.contract_items where contract_id=target_contract and id=any(art_ids) and merged_into is null;
 if n<>cardinality(art_ids) then raise exception 'Contract items changed'; end if;
 if n>1 then
  insert into public.contract_arts_merges(contract_id,actor_id,main_item_id,previous_items,previous_assignments)
  values(target_contract,actor_id,main_id,
   (select jsonb_agg(to_jsonb(i)) from public.contract_items i where i.contract_id=target_contract and i.id=any(art_ids)),
   coalesce((select jsonb_agg(to_jsonb(a)) from public.contract_item_assignments a where a.contract_id=target_contract and a.contract_item_id=any(art_ids)),'[]'::jsonb));
 end if;
 select coalesce(array_agg(distinct member_id),'{}'::uuid[]) into members from public.contract_item_assignments a cross join lateral unnest(a.team_member_ids) as selected(member_id)
 where a.contract_id=target_contract and a.contract_item_id=any(art_ids);
 update public.contract_items set name='Artes',monthly_quantity=quantity,extra_value=extra_price,is_active=active where id=main_id and contract_id=target_contract;
 update public.contract_items set merged_into=main_id,is_active=false where contract_id=target_contract and id=any(art_ids) and id<>main_id;
 insert into public.contract_item_assignments(contract_item_id,contract_id,team_member_ids,updated_by,updated_at)
 values(main_id,target_contract,members,actor_id,now())
 on conflict(contract_item_id) do update set team_member_ids=excluded.team_member_ids,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 return main_id;
end;
$$;
revoke all on function public.avesso_merge_contract_arts(uuid,uuid,uuid[],uuid,integer,numeric,boolean) from public,anon,authenticated;
grant execute on function public.avesso_merge_contract_arts(uuid,uuid,uuid[],uuid,integer,numeric,boolean) to service_role;
commit;
