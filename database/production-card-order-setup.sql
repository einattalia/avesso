-- Ordenação persistente dos cards da Produção.
begin;

alter table public.demands add column if not exists sort_order bigint;

with ranked as (
 select id, row_number() over (
  partition by organization_id, client_id, project_id
  order by created_at desc, id
 ) - 1 as position
 from public.demands
)
update public.demands as demand
set sort_order = ranked.position
from ranked
where demand.id = ranked.id and demand.sort_order is null;

alter table public.demands alter column sort_order set not null;

create index if not exists demands_active_card_order
 on public.demands(organization_id, client_id, project_id, sort_order)
 where archived_at is null;

create or replace function public.avesso_assign_demand_sort_order()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
 if tg_op = 'INSERT' or new.organization_id is distinct from old.organization_id
    or new.client_id is distinct from old.client_id
    or new.project_id is distinct from old.project_id then
  select coalesce(max(sort_order) + 1, 0)
    into new.sort_order
    from public.demands
   where organization_id = new.organization_id
     and client_id = new.client_id
     and project_id is not distinct from new.project_id
     and archived_at is null
     and (tg_op = 'INSERT' or id <> old.id);
 end if;
 return new;
end;
$$;

drop trigger if exists avesso_demand_card_order on public.demands;
create trigger avesso_demand_card_order
before insert or update of organization_id, client_id, project_id on public.demands
for each row execute function public.avesso_assign_demand_sort_order();

create or replace function public.avesso_reorder_demands(demand_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare changed integer;
begin
 update public.demands as demand
    set sort_order = ordered.ordinality - 1
   from unnest(demand_ids) with ordinality as ordered(id, ordinality)
  where demand.id = ordered.id;
 get diagnostics changed = row_count;
 return changed;
end;
$$;

revoke all on function public.avesso_reorder_demands(uuid[]) from public, anon, authenticated;
grant execute on function public.avesso_reorder_demands(uuid[]) to service_role;

commit;
