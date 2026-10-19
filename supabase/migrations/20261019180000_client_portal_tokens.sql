create table if not exists public.client_portal_tokens (
  client_id uuid primary key references public.clients(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.client_portal_tokens enable row level security;
revoke all on table public.client_portal_tokens from anon, authenticated;
grant select, insert, update, delete on table public.client_portal_tokens to service_role;

create index if not exists client_portal_tokens_organization_id_idx on public.client_portal_tokens (organization_id);
