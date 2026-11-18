create table if not exists public.client_instagram_connections (
  client_id uuid primary key references public.clients(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instagram_user_id text not null,
  username text not null,
  account_type text,
  access_token_ciphertext text not null,
  token_expires_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_instagram_connections_org_idx
  on public.client_instagram_connections (organization_id);

alter table public.client_instagram_connections enable row level security;
revoke all on public.client_instagram_connections from public, anon, authenticated;
grant select, insert, update, delete on public.client_instagram_connections to service_role;
