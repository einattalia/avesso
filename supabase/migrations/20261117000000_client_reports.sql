create table if not exists public.client_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_reports_client_period_key unique (client_id, period)
);

create index if not exists client_reports_client_period_idx
  on public.client_reports (client_id, period desc);

create index if not exists client_reports_org_status_period_idx
  on public.client_reports (organization_id, status, period desc);

alter table public.client_reports enable row level security;
revoke all on public.client_reports from public, anon, authenticated;
grant select, insert, update, delete on public.client_reports to service_role;

