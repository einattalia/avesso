create table if not exists public.client_monthly_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  plan_month date not null check (extract(day from plan_month) = 1),
  status text not null default 'draft' check (status in ('draft','shared')),
  shared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, plan_month),
  unique (id, organization_id, client_id)
);

create table if not exists public.client_monthly_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  organization_id uuid not null,
  client_id uuid not null,
  position integer not null default 0,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 20000),
  format text check (format is null or char_length(format) <= 80),
  scheduled_date date,
  status text not null default 'draft' check (status in ('draft','pending','approved','changes_requested')),
  review_note text,
  responded_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_monthly_plan_items_plan_fkey
    foreign key (plan_id, organization_id, client_id)
    references public.client_monthly_plans(id, organization_id, client_id)
    on delete cascade
);

create table if not exists public.client_monthly_plan_item_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.client_monthly_plans(id) on delete cascade,
  item_id uuid references public.client_monthly_plan_items(id) on delete set null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  actor_type text not null check (actor_type in ('agency','client')),
  event text not null check (event in ('created','edited','shared','approved','changes_requested','resent','removed')),
  actor_name text,
  note text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.client_monthly_plans enable row level security;
alter table public.client_monthly_plan_items enable row level security;
alter table public.client_monthly_plan_item_events enable row level security;

revoke all on table public.client_monthly_plans, public.client_monthly_plan_items, public.client_monthly_plan_item_events from anon, authenticated;
grant select, insert, update, delete on table public.client_monthly_plans, public.client_monthly_plan_items, public.client_monthly_plan_item_events to service_role;

create index if not exists client_monthly_plans_org_client_month_idx
  on public.client_monthly_plans (organization_id, client_id, plan_month desc);
create index if not exists client_monthly_plan_items_plan_order_idx
  on public.client_monthly_plan_items (plan_id, position) where removed_at is null;
create index if not exists client_monthly_plan_events_item_created_idx
  on public.client_monthly_plan_item_events (item_id, created_at desc);
create index if not exists client_monthly_plan_events_plan_created_idx
  on public.client_monthly_plan_item_events (plan_id, created_at desc);
