create table if not exists public.client_report_branding (
  client_id uuid primary key references public.clients(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  logo_path text check (logo_path is null or char_length(logo_path) <= 1024),
  primary_color text not null default '#ffc928' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color text not null default '#f18523' check (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists client_report_branding_organization_idx
  on public.client_report_branding (organization_id);

alter table public.client_report_branding enable row level security;
revoke all on public.client_report_branding from public, anon, authenticated;
grant select, insert, update, delete on public.client_report_branding to service_role;
