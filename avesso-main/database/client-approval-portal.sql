-- Execute depois de briefing-production-setup.sql e production-projects-setup.sql.
-- O banco guarda o SHA-256 para validar e uma cópia criptografada, acessível apenas ao servidor, para reexibir o link à agência.
begin;

create table if not exists public.approval_link_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  client_id uuid not null references public.clients(id) on delete cascade,
  demand_id uuid not null references public.demands(id) on delete cascade,
  demand_version_id uuid not null references public.demand_versions(id) on delete cascade,
  token_encrypted text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  used_at timestamptz
);
alter table public.approval_link_tokens add column if not exists token_encrypted text;

-- An option set groups multiple artwork versions in one client decision.
create table if not exists public.approval_option_sets (
  id uuid primary key default gen_random_uuid(),
  demand_id uuid not null references public.demands(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  state text not null default 'pending' check(state in ('pending','selected','changes_requested','superseded')),
  selected_version_id uuid references public.demand_versions(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.demand_versions add column if not exists approval_option_set_id uuid references public.approval_option_sets(id) on delete set null;
alter table public.approval_link_tokens add column if not exists approval_option_set_id uuid references public.approval_option_sets(id) on delete set null;
alter table public.approval_option_sets enable row level security;
revoke all on public.approval_option_sets from public,anon,authenticated;
grant select,insert,update,delete on public.approval_option_sets to service_role;
create index if not exists demand_versions_option_set on public.demand_versions(approval_option_set_id,version_number);

alter table public.approval_link_tokens enable row level security;
revoke all on public.approval_link_tokens from public,anon,authenticated;
grant select,insert,update,delete on public.approval_link_tokens to service_role;
create index if not exists approval_link_tokens_active on public.approval_link_tokens(demand_id,created_at desc) where revoked_at is null;

-- Link approvals have no Supabase user. Preserve the event while making the actor explicit.
alter table public.approval_events alter column user_id drop not null;
alter table public.approval_events add column if not exists actor_name text;
alter table public.approval_events add column if not exists note text;

create or replace function public.avesso_issue_approval_link(target_demand uuid,target_version uuid,token_digest text,link_expires_at timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare d public.demands; v public.demand_versions; option_set uuid;
begin
  if token_digest !~ '^[a-f0-9]{64}$' or link_expires_at<=now() or link_expires_at>now()+interval '31 days' then
    raise exception 'Invalid approval link';
  end if;
  select * into d from public.demands where id=target_demand for update;
  select * into v from public.demand_versions where id=target_version and demand_id=target_demand for update;
  option_set:=v.approval_option_set_id;
  if d.id is null or v.id is null or d.archived_at is not null or d.client_id is null or d.status<>'with_client' or v.status<>'sent_for_review'
    or (option_set is null and v.id is distinct from (select id from public.demand_versions where demand_id=d.id order by version_number desc limit 1))
    or (option_set is not null and not exists(select 1 from public.approval_option_sets where id=option_set and demand_id=d.id and state='pending')) then
    raise exception 'Approval unavailable';
  end if;
  if option_set is null then update public.approval_option_sets set state='superseded',resolved_at=now() where demand_id=d.id and state in ('selected','changes_requested'); end if;
  update public.approval_link_tokens set revoked_at=now()
    where demand_id=d.id and revoked_at is null and used_at is null;
  insert into public.approval_link_tokens(token_hash,client_id,demand_id,demand_version_id,approval_option_set_id,expires_at)
    values(token_digest,d.client_id,d.id,v.id,option_set,link_expires_at);
end;
$$;
revoke all on function public.avesso_issue_approval_link(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.avesso_issue_approval_link(uuid,uuid,text,timestamptz) to service_role;

-- Re-issue links while retaining an encrypted copy so authorized agency users can
-- copy the same link after reopening a card. Encryption key stays server-side.
create or replace function public.avesso_issue_approval_link_v2(target_demand uuid,target_version uuid,token_digest text,encrypted_value text,link_expires_at timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare d public.demands; v public.demand_versions; option_set uuid;
begin
  if token_digest !~ '^[a-f0-9]{64}$' or length(encrypted_value)>512 or length(encrypted_value)<32
    or link_expires_at<=now() or link_expires_at>now()+interval '31 days' then
    raise exception 'Invalid approval link';
  end if;
  select * into d from public.demands where id=target_demand for update;
  select * into v from public.demand_versions where id=target_version and demand_id=target_demand for update;
  option_set:=v.approval_option_set_id;
  if d.id is null or v.id is null or d.archived_at is not null or d.client_id is null or d.status<>'with_client' or v.status<>'sent_for_review'
    or (option_set is null and v.id is distinct from (select id from public.demand_versions where demand_id=d.id order by version_number desc limit 1))
    or (option_set is not null and not exists(select 1 from public.approval_option_sets where id=option_set and demand_id=d.id and state='pending')) then
    raise exception 'Approval unavailable';
  end if;
  if option_set is null then update public.approval_option_sets set state='superseded',resolved_at=now() where demand_id=d.id and state in ('selected','changes_requested'); end if;
  update public.approval_link_tokens set revoked_at=now()
    where demand_id=d.id and revoked_at is null and used_at is null;
  insert into public.approval_link_tokens(token_hash,client_id,demand_id,demand_version_id,approval_option_set_id,token_encrypted,expires_at)
    values(token_digest,d.client_id,d.id,v.id,option_set,encrypted_value,link_expires_at);
end;
$$;
revoke all on function public.avesso_issue_approval_link_v2(uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.avesso_issue_approval_link_v2(uuid,uuid,text,text,timestamptz) to service_role;

-- Upload multiple draft versions from one card as a single client review.
create or replace function public.avesso_send_approval_options(target_demand uuid,target_versions uuid[],actor_id uuid,token_digest text,encrypted_value text,link_expires_at timestamptz)
returns text language plpgsql security invoker set search_path='' as $$
declare d public.demands; option_set uuid; selected_count integer; representative uuid;
begin
  if target_versions is null or cardinality(target_versions)<2 or cardinality(target_versions)>8
    or cardinality(target_versions)<>(select count(distinct version_id) from unnest(target_versions) as versions(version_id))
    or token_digest !~ '^[a-f0-9]{64}$' or length(encrypted_value)>512 or length(encrypted_value)<32
    or link_expires_at<=now() or link_expires_at>now()+interval '31 days' then raise exception 'Invalid options'; end if;
  select * into d from public.demands where id=target_demand for update;
  if d.id is null or d.archived_at is not null or d.client_id is null or d.status not in ('in_production','internal_review','adjustments','with_client')
    or not exists(select 1 from public.organization_members m where m.organization_id=d.organization_id and m.user_id=actor_id and m.is_active and m.role<>'client_user') then
    raise exception 'Permission denied';
  end if;
  perform 1 from public.demand_versions where demand_id=d.id and id=any(target_versions) and status in ('draft','changes_requested') for update;
  select count(*) into selected_count from public.demand_versions where demand_id=d.id and id=any(target_versions) and status in ('draft','changes_requested');
  if selected_count<>cardinality(target_versions) then raise exception 'Options changed'; end if;
  select id into representative from public.demand_versions where demand_id=d.id and id=any(target_versions) order by version_number desc limit 1;
  update public.approval_option_sets set state='superseded',resolved_at=now() where demand_id=d.id and state in ('pending','selected','changes_requested');
  update public.approval_link_tokens set revoked_at=now() where demand_id=d.id and revoked_at is null and used_at is null;
  update public.approval_notifications set state='cancelled' where demand_id=d.id and state in ('pending','failed');
  insert into public.approval_option_sets(demand_id,client_id) values(d.id,d.client_id) returning id into option_set;
  update public.demand_versions set status='sent_for_review',approval_option_set_id=option_set where demand_id=d.id and id=any(target_versions);
  insert into public.approval_events(demand_version_id,user_id,event)
    select id,actor_id,'sent' from public.demand_versions where demand_id=d.id and id=any(target_versions);
  update public.demands set status='with_client' where id=d.id;
  insert into public.approval_link_tokens(token_hash,client_id,demand_id,demand_version_id,approval_option_set_id,token_encrypted,expires_at)
    values(token_digest,d.client_id,d.id,representative,option_set,encrypted_value,link_expires_at);
  insert into public.approval_notifications(demand_id,version_id)
    select d.id,representative from public.clients c where c.id=d.client_id and c.whatsapp_approval_opt_in and nullif(trim(c.whatsapp),'') is not null
    on conflict(version_id) do nothing;
  return 'with_client';
end;
$$;
revoke all on function public.avesso_send_approval_options(uuid,uuid[],uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.avesso_send_approval_options(uuid,uuid[],uuid,text,text,timestamptz) to service_role;

-- Resolve a grouped review with the client's selected version or adjustment note.
create or replace function public.avesso_review_public_link_v2(token_digest text,decision text,note text default '',selected_version uuid default null)
returns text language plpgsql security invoker set search_path='' as $$
declare l public.approval_link_tokens; d public.demands; v public.demand_versions; option_set public.approval_option_sets; outcome text; v_note text:=trim(coalesce(note,''));
begin
  if token_digest !~ '^[a-f0-9]{64}$' or decision not in ('approve','changes') then raise exception 'Approval link unavailable'; end if;
  if decision='changes' and length(v_note)<3 then raise exception 'Descreva os ajustes necessários.'; end if;
  if length(v_note)>20000 then raise exception 'Texto muito longo'; end if;
  select * into l from public.approval_link_tokens where token_hash=token_digest;
  if not found then raise exception 'Approval link unavailable'; end if;
  select * into d from public.demands where id=l.demand_id and client_id=l.client_id for update;
  select * into l from public.approval_link_tokens where token_hash=token_digest for update;
  if not found or l.revoked_at is not null or l.expires_at<=now() then raise exception 'Approval link unavailable'; end if;
  if l.approval_option_set_id is not null then
    select * into option_set from public.approval_option_sets where id=l.approval_option_set_id and demand_id=l.demand_id for update;
    if l.used_at is not null then
      if decision='approve' and option_set.state='selected' and option_set.selected_version_id=selected_version then return 'approved'; end if;
      if decision='changes' and option_set.state='changes_requested' then return 'changes_requested'; end if;
      raise exception 'Approval link unavailable';
    end if;
    if d.id is null or d.archived_at is not null or d.status<>'with_client' or option_set.id is null or option_set.state<>'pending' then raise exception 'Esta revisão não está mais aguardando aprovação.'; end if;
    if decision='approve' then
      if selected_version is null or not exists(select 1 from public.demand_versions where id=selected_version and demand_id=d.id and approval_option_set_id=option_set.id and status='sent_for_review') then raise exception 'Escolha uma das opções enviadas.'; end if;
      select * into v from public.demand_versions where id=selected_version and demand_id=d.id for update;
      outcome='approved';
      update public.approval_option_sets set state='selected',selected_version_id=v.id,resolved_at=now() where id=option_set.id;
      update public.demand_versions set status='approved' where id=v.id;
      insert into public.approval_events(demand_version_id,user_id,event,actor_name) values(v.id,null,'approved','Cliente (link seguro)');
      update public.demands set status='approved' where id=d.id;
    else
      outcome='changes_requested';
      update public.approval_option_sets set state='changes_requested',review_note=v_note,resolved_at=now() where id=option_set.id;
      update public.demand_versions set status='changes_requested' where approval_option_set_id=option_set.id;
      insert into public.approval_events(demand_version_id,user_id,event,actor_name,note)
        select id,null,'changes_requested','Cliente (link seguro)',v_note from public.demand_versions where approval_option_set_id=option_set.id;
      update public.demands set status='adjustments' where id=d.id;
    end if;
  else
    if l.used_at is not null then
      if decision='approve' and d.status='approved' then return 'approved'; end if;
      if decision='changes' and d.status='adjustments' then return 'changes_requested'; end if;
      raise exception 'Approval link unavailable';
    end if;
    select * into v from public.demand_versions where id=l.demand_version_id and demand_id=l.demand_id for update;
    if d.id is null or v.id is null or d.archived_at is not null or d.status<>'with_client' or v.status<>'sent_for_review'
      or v.id is distinct from (select id from public.demand_versions where demand_id=d.id order by version_number desc limit 1) then raise exception 'Esta versão não está mais aguardando aprovação.'; end if;
    outcome:=case when decision='approve' then 'approved' else 'changes_requested' end;
    update public.demand_versions set status=outcome where id=v.id;
    insert into public.approval_events(demand_version_id,user_id,event,actor_name,note) values(v.id,null,outcome,'Cliente (link seguro)',case when decision='changes' then v_note else null end);
    update public.demands set status=case when decision='approve' then 'approved' else 'adjustments' end where id=d.id;
  end if;
  update public.approval_notifications set state='cancelled' where demand_id=d.id and state in ('pending','failed');
  update public.approval_link_tokens set used_at=now() where id=l.id;
  return outcome;
end;
$$;
revoke all on function public.avesso_review_public_link_v2(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.avesso_review_public_link_v2(text,text,text,uuid) to service_role;

-- Keep the WhatsApp queue valid when the representative version belongs to an option set.
create or replace function public.avesso_claim_approval_notification(target_demand uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.approval_notifications; d public.demands; c public.clients; claim_token uuid;
begin
  update public.approval_notifications set state='uncertain',error_code='INTERRUPTED_SEND' where demand_id=target_demand and state='sending' and claimed_at<now()-interval '10 minutes';
  select * into j from public.approval_notifications where demand_id=target_demand and state in ('pending','failed') and attempts<3 order by created_at desc limit 1 for update skip locked;
  if not found then return null; end if;
  select * into d from public.demands where id=j.demand_id;
  select * into c from public.clients where id=d.client_id;
  if d.status<>'with_client' or not c.whatsapp_approval_opt_in or nullif(trim(c.whatsapp),'') is null
    or not exists(select 1 from public.demand_versions x where x.id=j.version_id and x.status='sent_for_review'
      and (x.id is distinct from (select id from public.demand_versions where demand_id=d.id order by version_number desc limit 1)
        or exists(select 1 from public.approval_option_sets s where s.id=x.approval_option_set_id and s.state='pending'))) then
    update public.approval_notifications set state='cancelled' where id=j.id;return null;
  end if;
  claim_token=gen_random_uuid();
  update public.approval_notifications set state='sending',attempts=attempts+1,claimed_at=now(),lease_id=claim_token where id=j.id;
  return jsonb_build_object('id',j.id,'lease_id',claim_token,'demand_id',d.id,'version_id',j.version_id,'phone',c.whatsapp,'title',d.title);
end;
$$;
revoke all on function public.avesso_claim_approval_notification(uuid) from public,anon,authenticated;
grant execute on function public.avesso_claim_approval_notification(uuid) to service_role;

-- The signed-in client workspace uses the same option set decision flow.
create or replace function public.avesso_review_option_set_client(target_demand uuid,target_version uuid,actor_id uuid,decision text,note text default '')
returns text language plpgsql security invoker set search_path='' as $$
declare d public.demands; v public.demand_versions; option_set public.approval_option_sets; v_note text:=trim(coalesce(note,'')); outcome text;
begin
  if decision not in ('approve','changes') or (decision='changes' and length(v_note)<3) or length(v_note)>20000 then raise exception 'Invalid review'; end if;
  select * into d from public.demands where id=target_demand for update;
  select * into v from public.demand_versions where id=target_version and demand_id=target_demand for update;
  if d.id is null or v.id is null or v.approval_option_set_id is null or d.status<>'with_client' or v.status<>'sent_for_review'
    or not exists(select 1 from public.client_users cu join public.organization_members m on m.user_id=cu.user_id and m.organization_id=d.organization_id and m.is_active and m.role='client_user' where cu.client_id=d.client_id and cu.user_id=actor_id) then raise exception 'Permission denied'; end if;
  select * into option_set from public.approval_option_sets where id=v.approval_option_set_id and demand_id=d.id and state='pending' for update;
  if not found then raise exception 'Esta revisão não está mais aguardando aprovação.'; end if;
  if decision='approve' then
    update public.approval_option_sets set state='selected',selected_version_id=v.id,resolved_at=now() where id=option_set.id;
    update public.demand_versions set status='approved' where id=v.id;
    insert into public.approval_events(demand_version_id,user_id,event,actor_name) values(v.id,actor_id,'approved','Cliente');
    outcome='approved';
  else
    update public.approval_option_sets set state='changes_requested',review_note=v_note,resolved_at=now() where id=option_set.id;
    update public.demand_versions set status='changes_requested' where approval_option_set_id=option_set.id;
    insert into public.approval_events(demand_version_id,user_id,event,actor_name,note)
      select id,actor_id,'changes_requested','Cliente',v_note from public.demand_versions where approval_option_set_id=option_set.id;
    outcome='changes_requested';
  end if;
  if length(v_note)>0 then
    insert into public.client_notes(client_id,subject_id,subject_type,body,author_id,author_name) values(d.client_id,v.id,'version',v_note,actor_id,'Cliente');
  end if;
  update public.demands set status=case when decision='approve' then 'approved' else 'adjustments' end where id=d.id;
  update public.approval_link_tokens set used_at=coalesce(used_at,now()) where approval_option_set_id=option_set.id and revoked_at is null;
  update public.approval_notifications set state='cancelled' where demand_id=d.id and state in ('pending','failed');
  return outcome;
end;
$$;
revoke all on function public.avesso_review_option_set_client(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.avesso_review_option_set_client(uuid,uuid,uuid,text,text) to service_role;

create or replace function public.avesso_approve_public_link(token_digest text)
returns text language plpgsql security invoker set search_path='' as $$
declare l public.approval_link_tokens; d public.demands; v public.demand_versions;
begin
  if token_digest !~ '^[a-f0-9]{64}$' then raise exception 'Approval link unavailable'; end if;
  -- Lock demand before link to match issuance order and avoid a send/approve deadlock.
  select * into l from public.approval_link_tokens where token_hash=token_digest;
  if not found then raise exception 'Approval link unavailable'; end if;
  select * into d from public.demands where id=l.demand_id and client_id=l.client_id for update;
  select * into l from public.approval_link_tokens where token_hash=token_digest for update;
  if not found or l.revoked_at is not null or l.expires_at<=now() then raise exception 'Approval link unavailable'; end if;
  if l.used_at is not null then
    if d.id is not null and d.status='approved' then return 'approved'; end if;
    raise exception 'Approval link unavailable';
  end if;
  select * into v from public.demand_versions where id=l.demand_version_id and demand_id=l.demand_id for update;
  if d.id is null or v.id is null or d.archived_at is not null or d.status<>'with_client' or v.status<>'sent_for_review'
    or v.id is distinct from (select id from public.demand_versions where demand_id=d.id order by version_number desc limit 1) then
    raise exception 'Esta versão não está mais aguardando aprovação.';
  end if;
  update public.demand_versions set status='approved' where id=v.id;
  insert into public.approval_events(demand_version_id,user_id,event,actor_name)
    values(v.id,null,'approved','Cliente (link seguro)');
  update public.demands set status='approved' where id=d.id;
  update public.approval_notifications set state='cancelled' where demand_id=d.id and state in ('pending','failed');
  update public.approval_link_tokens set used_at=now() where id=l.id;
  return 'approved';
end;
$$;
revoke all on function public.avesso_approve_public_link(text) from public,anon,authenticated;
grant execute on function public.avesso_approve_public_link(text) to service_role;

-- Secure public review link supports both approval and an adjustment request.
create or replace function public.avesso_review_public_link(token_digest text,decision text,note text default '')
returns text language plpgsql security invoker set search_path='' as $$
declare l public.approval_link_tokens; d public.demands; v public.demand_versions; outcome text; review_note text:=trim(coalesce(note,''));
begin
  if token_digest !~ '^[a-f0-9]{64}$' or decision not in ('approve','changes') then raise exception 'Approval link unavailable'; end if;
  if decision='changes' and length(review_note)<3 then raise exception 'Descreva os ajustes necessários.'; end if;
  if length(review_note)>20000 then raise exception 'Texto muito longo'; end if;
  select * into l from public.approval_link_tokens where token_hash=token_digest;
  if not found then raise exception 'Approval link unavailable'; end if;
  select * into d from public.demands where id=l.demand_id and client_id=l.client_id for update;
  select * into l from public.approval_link_tokens where token_hash=token_digest for update;
  if not found or l.revoked_at is not null or l.expires_at<=now() then raise exception 'Approval link unavailable'; end if;
  if l.used_at is not null then
    if decision='approve' and d.id is not null and d.status='approved' then return 'approved'; end if;
    if decision='changes' and d.id is not null and d.status='adjustments' then return 'changes_requested'; end if;
    raise exception 'Approval link unavailable';
  end if;
  select * into v from public.demand_versions where id=l.demand_version_id and demand_id=l.demand_id for update;
  if d.id is null or v.id is null or d.archived_at is not null or d.status<>'with_client' or v.status<>'sent_for_review'
    or v.id is distinct from (select id from public.demand_versions where demand_id=d.id order by version_number desc limit 1) then
    raise exception 'Esta versão não está mais aguardando aprovação.';
  end if;
  outcome:=case when decision='approve' then 'approved' else 'changes_requested' end;
  update public.demand_versions set status=outcome where id=v.id;
  insert into public.approval_events(demand_version_id,user_id,event,actor_name,note)
    values(v.id,null,outcome,'Cliente (link seguro)',case when decision='changes' then review_note else null end);
  update public.demands set status=case when decision='approve' then 'approved' else 'adjustments' end where id=d.id;
  update public.approval_notifications set state='cancelled' where demand_id=d.id and state in ('pending','failed');
  update public.approval_link_tokens set used_at=now() where id=l.id;
  return outcome;
end;
$$;
revoke all on function public.avesso_review_public_link(text,text,text) from public,anon,authenticated;
grant execute on function public.avesso_review_public_link(text,text,text) to service_role;

create or replace function public.avesso_approve_public_link(token_digest text)
returns text language sql security invoker set search_path='' as $$
  select public.avesso_review_public_link(token_digest,'approve','');
$$;
revoke all on function public.avesso_approve_public_link(text) from public,anon,authenticated;
grant execute on function public.avesso_approve_public_link(text) to service_role;

-- The existing WhatsApp claim now returns the exact version associated with its job.
create or replace function public.avesso_claim_approval_notification(target_demand uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.approval_notifications; d public.demands; c public.clients; claim_token uuid;
begin
  update public.approval_notifications set state='uncertain',error_code='INTERRUPTED_SEND'
    where demand_id=target_demand and state='sending' and claimed_at<now()-interval '10 minutes';
  select * into j from public.approval_notifications
    where demand_id=target_demand and state in ('pending','failed') and attempts<3
    order by created_at desc limit 1 for update skip locked;
  if not found then return null; end if;
  select * into d from public.demands where id=j.demand_id;
  select * into c from public.clients where id=d.client_id;
  if d.status<>'with_client' or not c.whatsapp_approval_opt_in or nullif(trim(c.whatsapp),'') is null
    or j.version_id is distinct from (select id from public.demand_versions where demand_id=d.id order by version_number desc limit 1)
    or not exists(select 1 from public.demand_versions x where x.id=j.version_id and x.status='sent_for_review') then
    update public.approval_notifications set state='cancelled' where id=j.id;return null;
  end if;
  claim_token=gen_random_uuid();
  update public.approval_notifications set state='sending',attempts=attempts+1,claimed_at=now(),lease_id=claim_token where id=j.id;
  return jsonb_build_object('id',j.id,'lease_id',claim_token,'demand_id',d.id,'version_id',j.version_id,'phone',c.whatsapp,'title',d.title);
end;
$$;
revoke all on function public.avesso_claim_approval_notification(uuid) from public,anon,authenticated;
grant execute on function public.avesso_claim_approval_notification(uuid) to service_role;

-- Uploading a revised artwork while approval is pending ends the old approval
-- atomically with creation of the new draft version. The old public link must
-- never approve a version that has already been replaced.
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
  if d.status='with_client' then
    update public.approval_option_sets set state='superseded',resolved_at=now() where demand_id=d.id and state='pending';
    update public.approval_link_tokens set revoked_at=now()
      where demand_id=d.id and revoked_at is null and used_at is null;
    update public.approval_notifications set state='cancelled'
      where demand_id=d.id and state in ('pending','failed');
  end if;
  update public.demands set status='internal_review' where id=d.id;
  update public.r2_upload_sessions set state='completed',version_number=n where id=s.id;
  return n;
end;
$$;
revoke all on function public.avesso_finalize_r2_upload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.avesso_finalize_r2_upload(uuid,uuid) to service_role;

commit;
