-- Execute após contracts-team-setup.sql.
begin;
create table if not exists public.briefing_documents (
  client_id uuid primary key references public.clients(id),
  content text not null default '' check(length(content)<=100000),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.briefing_files (
  id uuid primary key,
  client_id uuid not null references public.clients(id),
  storage_path text not null unique,
  bucket text not null,
  file_name text not null,
  file_size bigint not null check(file_size>0),
  mime_type text not null,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.briefing_upload_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  client_id uuid not null references public.clients(id),
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
alter table public.briefing_documents enable row level security;
alter table public.briefing_files enable row level security;
alter table public.briefing_upload_sessions enable row level security;
revoke all on public.briefing_documents,public.briefing_files,public.briefing_upload_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.briefing_documents,public.briefing_files,public.briefing_upload_sessions to service_role;
create index if not exists briefing_files_by_client on public.briefing_files(client_id,created_at);
create index if not exists briefing_upload_owner on public.briefing_upload_sessions(user_id,state,expires_at);

create or replace function public.avesso_finalize_briefing_upload(session_id uuid,actor_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare s public.briefing_upload_sessions; c public.clients;
begin
  select * into s from public.briefing_upload_sessions where id=session_id and user_id=actor_id for update;
  if not found then raise exception 'Upload unavailable'; end if;
  select * into c from public.clients where id=s.client_id for update;
  if not found or not exists (
    select 1 from public.organization_members m where m.organization_id=c.organization_id
      and m.user_id=actor_id and m.is_active=true and m.role<>'client_user'
  ) then raise exception 'Permission denied'; end if;
  if s.state='completed' then return s.id; end if;
  if s.state<>'pending' or s.expires_at<=now() then raise exception 'Upload expired'; end if;
  insert into public.briefing_files(id,client_id,storage_path,bucket,file_name,file_size,mime_type,uploaded_by)
    values(s.id,s.client_id,s.object_key,s.bucket,s.file_name,s.file_size,s.mime_type,actor_id);
  update public.briefing_upload_sessions set state='completed' where id=s.id;
  return s.id;
end;
$$;
revoke all on function public.avesso_finalize_briefing_upload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.avesso_finalize_briefing_upload(uuid,uuid) to service_role;

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
 update public.contract_items set name='Criativos',monthly_quantity=quantity,extra_value=extra_price,is_active=active where id=main_id and contract_id=target_contract;
 update public.contract_items set merged_into=main_id,is_active=false where contract_id=target_contract and id=any(art_ids) and id<>main_id;
 insert into public.contract_item_assignments(contract_item_id,contract_id,team_member_ids,updated_by,updated_at)
 values(main_id,target_contract,members,actor_id,now())
 on conflict(contract_item_id) do update set team_member_ids=excluded.team_member_ids,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 return main_id;
end;
$$;
revoke all on function public.avesso_merge_contract_arts(uuid,uuid,uuid[],uuid,integer,numeric,boolean) from public,anon,authenticated;
grant execute on function public.avesso_merge_contract_arts(uuid,uuid,uuid[],uuid,integer,numeric,boolean) to service_role;


alter table public.demands drop constraint if exists demands_status_check;
alter table public.demands add constraint demands_status_check check(status in ('briefing','awaiting_material','in_production','internal_review','with_client','adjustments','approved','awaiting_scheduling','scheduled','posted','delivered'));
alter table public.clients add column if not exists whatsapp_approval_opt_in boolean not null default false;

create table if not exists public.production_activity (
 id uuid primary key default gen_random_uuid(),demand_id uuid not null references public.demands(id),
 from_status text,to_status text not null,created_at timestamptz not null default now()
);
create table if not exists public.approval_notifications (
 id uuid primary key default gen_random_uuid(),demand_id uuid not null references public.demands(id),
 version_id uuid not null unique references public.demand_versions(id),
 state text not null default 'pending' check(state in ('pending','sending','accepted','failed','uncertain','cancelled')),
 attempts integer not null default 0,lease_id uuid,claimed_at timestamptz,
 message_id text,error_code text,created_at timestamptz not null default now()
);
alter table public.production_activity enable row level security;
alter table public.approval_notifications enable row level security;
revoke all on public.production_activity,public.approval_notifications from public,anon,authenticated;
grant select,insert,update,delete on public.production_activity,public.approval_notifications to service_role;
create index if not exists production_activity_demand on public.production_activity(demand_id,created_at);
create index if not exists approval_notifications_queue on public.approval_notifications(state,created_at);

create or replace function public.avesso_log_production_activity()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status is distinct from old.status then
  insert into public.production_activity(demand_id,from_status,to_status) values(new.id,old.status,new.status);
 end if;
 return new;
end; $$;
drop trigger if exists avesso_production_history on public.demands;
create trigger avesso_production_history after update of status on public.demands for each row execute function public.avesso_log_production_activity();

create or replace function public.avesso_production_action(target_demand uuid,target_version uuid,actor_id uuid,action_name text,new_status text default null)
returns text language plpgsql security invoker set search_path='' as $$
declare d public.demands; v public.demand_versions; agency boolean; linked boolean; next_status text; latest uuid; approved_version uuid;
begin
 select * into d from public.demands where id=target_demand for update;
 if not found then raise exception 'Demand unavailable'; end if;
 select exists(select 1 from public.organization_members m where m.organization_id=d.organization_id and m.user_id=actor_id and m.is_active and m.role<>'client_user') into agency;
 select exists(select 1 from public.client_users cu join public.organization_members m on m.user_id=cu.user_id and m.organization_id=d.organization_id and m.is_active and m.role='client_user' where cu.client_id=d.client_id and cu.user_id=actor_id) into linked;
 if not agency and not linked then raise exception 'Permission denied'; end if;
 if action_name in ('send','deliver','status') and not agency then raise exception 'Agency required'; end if;
 if action_name in ('approve','changes') and (agency or not linked) then raise exception 'Client required'; end if;
 select id into latest from public.demand_versions where demand_id=d.id order by version_number desc limit 1;
 if action_name in ('send','deliver','approve','changes') then
  select * into v from public.demand_versions where id=target_version and demand_id=d.id for update;
  if not found or v.id<>latest then raise exception 'Version changed'; end if;
 end if;
 if action_name='send' then
  if v.status='sent_for_review' and d.status='with_client' then return d.status; end if;
  if v.status not in ('draft','changes_requested') then raise exception 'Version unavailable'; end if;
  update public.demand_versions set status='sent_for_review' where id=v.id;
  insert into public.approval_events(demand_version_id,user_id,event) values(v.id,actor_id,'sent');
  next_status='with_client';
  insert into public.approval_notifications(demand_id,version_id)
   select d.id,v.id from public.clients c where c.id=d.client_id and c.whatsapp_approval_opt_in and nullif(trim(c.whatsapp),'') is not null
   on conflict(version_id) do nothing;
 elsif action_name in ('approve','changes') then
  next_status=case when action_name='approve' then 'approved' else 'adjustments' end;
  if d.status=next_status and v.status=(case when action_name='approve' then 'approved' else 'changes_requested' end) then return d.status; end if;
  if d.status<>'with_client' or v.status<>'sent_for_review' then raise exception 'Approval unavailable'; end if;
  update public.demand_versions set status=case when action_name='approve' then 'approved' else 'changes_requested' end where id=v.id;
  insert into public.approval_events(demand_version_id,user_id,event) values(v.id,actor_id,case when action_name='approve' then 'approved' else 'changes_requested' end);
 elsif action_name='deliver' then
  if v.status='delivered' and d.status='delivered' then return d.status; end if;
  if v.status<>'approved' then raise exception 'Approve first'; end if;
  update public.demand_versions set status='delivered' where id=v.id;
  insert into public.approval_events(demand_version_id,user_id,event) values(v.id,actor_id,'delivered');
  next_status='delivered';
 elsif action_name='status' then
  if new_status not in ('in_production','awaiting_scheduling','scheduled','posted') or new_status is null then raise exception 'Invalid status'; end if;
  if d.status=new_status then return d.status; end if;
  select id into approved_version from public.demand_versions where id=latest and status in ('approved','delivered');
  if new_status<>'in_production' and approved_version is null then raise exception 'Approval required'; end if;
  if new_status='awaiting_scheduling' and d.status<>'approved' then raise exception 'Approve first'; end if;
  if new_status='scheduled' and d.status<>'awaiting_scheduling' then raise exception 'Schedule step required'; end if;
  if new_status='posted' and d.status<>'scheduled' then raise exception 'Scheduled step required'; end if;
  if new_status='in_production' and d.status in ('posted','delivered') then raise exception 'Create another demand'; end if;
  if new_status='in_production' and latest is not null then update public.demand_versions set status='draft' where id=latest; end if;
  next_status=new_status;
 else raise exception 'Invalid action'; end if;
 update public.demands set status=next_status where id=d.id;
 if next_status<>'with_client' then update public.approval_notifications set state='cancelled' where demand_id=d.id and state in ('pending','failed'); end if;
 return next_status;
end; $$;
revoke all on function public.avesso_production_action(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.avesso_production_action(uuid,uuid,uuid,text,text) to service_role;

create or replace function public.avesso_claim_approval_notification(target_demand uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.approval_notifications; d public.demands; c public.clients; token uuid;
begin
 -- A stalled send is uncertain: never auto-resend after a potentially accepted request.
 update public.approval_notifications set state='uncertain',error_code='INTERRUPTED_SEND' where demand_id=target_demand and state='sending' and claimed_at<now()-interval '10 minutes';
 select * into j from public.approval_notifications where demand_id=target_demand and state in ('pending','failed') and attempts<3 order by created_at desc limit 1 for update skip locked;
 if not found then return null; end if;
 select * into d from public.demands where id=j.demand_id;
 select * into c from public.clients where id=d.client_id;
 if d.status<>'with_client' or not c.whatsapp_approval_opt_in or nullif(trim(c.whatsapp),'') is null or j.version_id is distinct from (select id from public.demand_versions where demand_id=d.id order by version_number desc limit 1) or not exists(select 1 from public.demand_versions v where v.id=j.version_id and v.status='sent_for_review') then
  update public.approval_notifications set state='cancelled' where id=j.id;return null;
 end if;
 token=gen_random_uuid();
 update public.approval_notifications set state='sending',attempts=attempts+1,claimed_at=now(),lease_id=token where id=j.id;
 return jsonb_build_object('id',j.id,'lease_id',token,'demand_id',d.id,'phone',c.whatsapp,'title',d.title);
end; $$;
create or replace function public.avesso_finish_approval_notification(job_id uuid,lease_id uuid,result_state text,result_message_id text,result_code text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if result_state not in ('accepted','failed','uncertain') then raise exception 'Invalid state'; end if;
 update public.approval_notifications n set state=result_state,message_id=result_message_id,error_code=result_code
 where n.id=job_id and n.lease_id=avesso_finish_approval_notification.lease_id and n.state='sending';
 if not found then raise exception 'Lease unavailable'; end if;
end; $$;
revoke all on function public.avesso_claim_approval_notification(uuid),public.avesso_finish_approval_notification(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.avesso_claim_approval_notification(uuid),public.avesso_finish_approval_notification(uuid,uuid,text,text,text) to service_role;
commit;


