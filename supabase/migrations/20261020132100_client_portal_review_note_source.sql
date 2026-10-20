CREATE OR REPLACE FUNCTION public.avesso_review_client_portal(target_demand uuid, portal_token_digest text, decision text, note text DEFAULT ''::text, selected_version uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare access_row public.client_portal_tokens; d public.demands; v public.demand_versions; option_set public.approval_option_sets; v_note text:=trim(coalesce(note,'')); outcome text;
begin
  if portal_token_digest !~ '^[a-f0-9]{64}$' or decision not in ('approve','changes') then raise exception 'Portal decision unavailable'; end if;
  if decision='changes' and length(v_note)<3 then raise exception 'Descreva os ajustes necessários.'; end if;
  if length(v_note)>20000 then raise exception 'Texto muito longo'; end if;

  select * into access_row from public.client_portal_tokens
    where token_hash=portal_token_digest and revoked_at is null;
  if not found then raise exception 'Portal decision unavailable'; end if;

  select * into d from public.demands
    where id=target_demand and client_id=access_row.client_id and organization_id=access_row.organization_id
    for update;
  if d.id is null or d.archived_at is not null or d.status<>'with_client' then
    raise exception 'Esta arte não está mais aguardando aprovação.';
  end if;

  select * into option_set from public.approval_option_sets
    where demand_id=d.id and client_id=d.client_id and state='pending'
    order by created_at desc limit 1 for update;

  if found then
    if option_set.review_mode='bundle' then
      if decision='approve' and selected_version is not null then raise exception 'Carrossel deve ser aprovado como conjunto.'; end if;
      if not exists(select 1 from public.demand_versions where demand_id=d.id and approval_option_set_id=option_set.id and status='sent_for_review' and removed_at is null) then
        raise exception 'Esta aprovação não está mais disponível.';
      end if;
      if decision='approve' then
        update public.approval_option_sets set state='selected',selected_version_id=null,resolved_at=now() where id=option_set.id;
        update public.demand_versions set status='approved' where demand_id=d.id and approval_option_set_id=option_set.id and status='sent_for_review' and removed_at is null;
        insert into public.approval_events(demand_version_id,user_id,event,actor_name)
          select id,null,'approved','Cliente (Portal do Cliente)' from public.demand_versions where demand_id=d.id and approval_option_set_id=option_set.id and removed_at is null;
      else
        update public.approval_option_sets set state='changes_requested',review_note=v_note,resolved_at=now() where id=option_set.id;
        update public.demand_versions set status='changes_requested' where demand_id=d.id and approval_option_set_id=option_set.id and status='sent_for_review' and removed_at is null;
        insert into public.approval_events(demand_version_id,user_id,event,actor_name,note)
          select id,null,'changes_requested','Cliente (Portal do Cliente)',v_note from public.demand_versions where demand_id=d.id and approval_option_set_id=option_set.id and removed_at is null;
      end if;
    else
      if selected_version is null then raise exception 'Escolha uma das artes enviadas.'; end if;
      select * into v from public.demand_versions
        where id=selected_version and demand_id=d.id and approval_option_set_id=option_set.id and status='sent_for_review' and removed_at is null
        for update;
      if v.id is null then raise exception 'Esta arte não está mais disponível para aprovação.'; end if;
      if decision='approve' then
        update public.approval_option_sets set state='selected',selected_version_id=v.id,resolved_at=now() where id=option_set.id;
        update public.demand_versions set status='approved' where id=v.id;
        insert into public.approval_events(demand_version_id,user_id,event,actor_name)
          values(v.id,null,'approved','Cliente (Portal do Cliente)');
      else
        update public.approval_option_sets set state='changes_requested',review_note=v_note,resolved_at=now() where id=option_set.id;
        update public.demand_versions set status='changes_requested' where demand_id=d.id and approval_option_set_id=option_set.id and status='sent_for_review' and removed_at is null;
        insert into public.approval_events(demand_version_id,user_id,event,actor_name,note)
          select id,null,'changes_requested','Cliente (Portal do Cliente)',v_note from public.demand_versions where demand_id=d.id and approval_option_set_id=option_set.id and removed_at is null;
      end if;
    end if;
  else
    select * into v from public.demand_versions
      where id=selected_version and demand_id=d.id and approval_option_set_id is null and status='sent_for_review' and removed_at is null
      for update;
    if v.id is null or v.id is distinct from (
      select id from public.demand_versions where demand_id=d.id and removed_at is null order by version_number desc limit 1
    ) then raise exception 'Esta versão não está mais aguardando aprovação.'; end if;
    outcome=case when decision='approve' then 'approved' else 'changes_requested' end;
    update public.demand_versions set status=outcome where id=v.id;
    insert into public.approval_events(demand_version_id,user_id,event,actor_name,note)
      values(v.id,null,outcome,'Cliente (Portal do Cliente)',case when decision='changes' then v_note else null end);
  end if;

  outcome=case when decision='approve' then 'approved' else 'adjustments' end;
  update public.demands set status=outcome where id=d.id;
  update public.approval_link_tokens set used_at=coalesce(used_at,now())
    where demand_id=d.id and revoked_at is null and used_at is null;
  update public.approval_notifications set state='cancelled' where demand_id=d.id and state in ('pending','failed');
  return outcome;
end;
$function$
