-- Execute no Supabase SQL Editor depois de briefing-production-setup.sql.
begin;

create table if not exists public.production_projects (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 client_id uuid not null references public.clients(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 160),
 description text not null default '' check(length(description)<=10000),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz
);

alter table public.demands add column if not exists project_id uuid references public.production_projects(id) on delete set null;
alter table public.demands add column if not exists approved_at timestamptz;
create index if not exists production_projects_client_active on public.production_projects(client_id,created_at desc) where archived_at is null;
create index if not exists demands_project on public.demands(project_id,created_at desc);

alter table public.production_projects enable row level security;
revoke all on public.production_projects from public,anon,authenticated;
grant select,insert,update,delete on public.production_projects to service_role;

create or replace function public.avesso_capture_demand_approval_date()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='approved' and old.status is distinct from 'approved' then
  new.approved_at=now();
 end if;
 return new;
end;
$$;
drop trigger if exists avesso_demand_approval_date on public.demands;
create trigger avesso_demand_approval_date before update of status on public.demands
for each row execute function public.avesso_capture_demand_approval_date();

commit;
