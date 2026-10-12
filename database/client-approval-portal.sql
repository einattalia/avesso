-- Execute depois de briefing-production-setup.sql e production-projects-setup.sql.
-- Os tokens brutos existem apenas no link enviado ao cliente; o banco guarda SHA-256.
begin;

create table if not exists public.approval_link_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  client_id uuid not null references public.clients(id) on delete cascade,
  demand_id uuid not null references public.demands(id) on delete cascade,
  demand_version_id uuid not null references public.demand_versions(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  used_at timestamptz
);

alter table public.approval_link_tokens enable row level security;
revoke all on public.approval_link_tokens from public,anon,authenticated;
grant select,insert,update,delete on public.approval_link_tokens to service_role;
create index if not exists approval_link_tokens_active on public.approval_link_tokens(demand_id,created_at desc) where revoked_at is null;

-- Link approvals have no Supabase user. Preserve the event while making the actor explicit.
alter table public.approval_events alter column user_id drop not null;
alter table public.approval_events add column if not exists actor_name text;

create or replace function public.avesso_issue_approval_link(target_demand uuid,target_version uuid,token_digest text,link_expires_at timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare d public.demands; v public.demand_versions;
begin
  if token_digest !~ '^[a-f0-9]{64}$' or link_expires_at<=now() or link_expires_at>now()+interval '31 days' then
    raise exception 'Invalid approval link';
  end if;
  select * into d from public.demands where id=target_demand for update;
  select * into v from public.demand_versions where id=target_version and demand_id=target_demand for update;
  if d.id is null or v.id is null or d.archived_at is not null or d.client_id is null or d.status<>'with_client' or v.status<>'sent_for_review'
    or v.id is distinct from (select id from public.demand_versions where demand_id=d.id order by version_number desc limit 1) then
    raise exception 'Approval unavailable';
  end if;
  update public.approval_link_tokens set revoked_at=now()
    where demand_id=d.id and revoked_at is null and used_at is null;
  insert into public.approval_link_tokens(token_hash,client_id,demand_id,demand_version_id,expires_at)
    values(token_digest,d.client_id,d.id,v.id,link_expires_at);
end;
$$;
revoke all on function public.avesso_issue_approval_link(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.avesso_issue_approval_link(uuid,uuid,text,timestamptz) to service_role;

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

commit;
