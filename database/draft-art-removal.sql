-- Permite remover um anexo ainda em rascunho, mantendo o histórico do card.
begin;

alter table public.demand_versions add column if not exists removed_at timestamptz;

create or replace function public.avesso_remove_draft_artwork(target_demand uuid,target_version uuid,actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare d public.demands; v public.demand_versions; latest uuid;
begin
 select * into d from public.demands where id=target_demand for update;
 if not found or d.archived_at is not null then raise exception 'Demand unavailable'; end if;
 if not exists(select 1 from public.organization_members m where m.organization_id=d.organization_id and m.user_id=actor_id and m.is_active and m.role<>'client_user') then raise exception 'Agency required'; end if;
 if d.status not in ('briefing','awaiting_material','in_production','internal_review','adjustments') then raise exception 'Artwork can no longer be removed'; end if;
 select * into v from public.demand_versions where id=target_version and demand_id=d.id and removed_at is null for update;
 if not found or v.status<>'draft' then raise exception 'Draft artwork unavailable'; end if;
 select id into latest from public.demand_versions where demand_id=d.id and removed_at is null order by version_number desc limit 1;
 if latest is distinct from v.id then raise exception 'Only the current draft can be removed'; end if;
 update public.demand_versions set removed_at=now() where id=v.id and removed_at is null;
 return jsonb_build_object('storage_provider',v.storage_provider,'storage_path',v.storage_path);
end;
$$;

revoke all on function public.avesso_remove_draft_artwork(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.avesso_remove_draft_artwork(uuid,uuid,uuid) to service_role;

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
 select id into latest from public.demand_versions where demand_id=d.id and removed_at is null order by version_number desc limit 1;
 if action_name in ('send','deliver','approve','changes') then
  select * into v from public.demand_versions where id=target_version and demand_id=d.id and removed_at is null for update;
  if not found or v.id is distinct from latest then raise exception 'Version changed'; end if;
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
  select id into approved_version from public.demand_versions where id=latest and removed_at is null and status in ('approved','delivered');
  if new_status<>'in_production' and approved_version is null then raise exception 'Approval required'; end if;
  if new_status='awaiting_scheduling' and d.status<>'approved' then raise exception 'Approve first'; end if;
  if new_status='scheduled' and d.status<>'awaiting_scheduling' then raise exception 'Schedule step required'; end if;
  if new_status='posted' and d.status<>'scheduled' then raise exception 'Scheduled step required'; end if;
  if new_status='in_production' and d.status in ('posted','delivered') then raise exception 'Create another demand'; end if;
  if new_status='in_production' and latest is not null then update public.demand_versions set status='draft' where id=latest and removed_at is null; end if;
  next_status=new_status;
 else raise exception 'Invalid action'; end if;
 update public.demands set status=next_status where id=d.id;
 if next_status<>'with_client' then update public.approval_notifications set state='cancelled' where demand_id=d.id and state in ('pending','failed'); end if;
 return next_status;
end; $$;
revoke all on function public.avesso_production_action(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.avesso_production_action(uuid,uuid,uuid,text,text) to service_role;

commit;
