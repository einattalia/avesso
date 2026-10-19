alter table public.clients
  add column if not exists photo_path text;

alter table public.agency_team_members
  add column if not exists photo_path text;

alter table public.demands
  add column if not exists responsible_member_id uuid references public.agency_team_members(id) on delete set null,
  add column if not exists delivered_at timestamptz;

alter table public.agency_team_members
  drop constraint if exists agency_team_members_role_check;
alter table public.agency_team_members
  add constraint agency_team_members_role_check
  check (role = any (array['designer'::text, 'videomaker'::text, 'paid_media'::text]));

create index if not exists demands_client_delivered_at_idx
  on public.demands (client_id, delivered_at desc);

update public.demands d
set responsible_member_id = m.id
from public.agency_team_members m
where d.responsible_member_id is null
  and d.organization_id = m.organization_id
  and d.responsible_name is not null
  and lower(trim(d.responsible_name)) = lower(trim(m.name));

update public.demands d
set delivered_at = coalesce((
  select min(a.created_at)
  from public.production_activity a
  where a.demand_id = d.id
    and a.to_status in ('delivered', 'posted')
), d.updated_at)
where d.status in ('delivered', 'posted')
  and d.delivered_at is null;

create or replace function public.avesso_set_demand_delivered_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('delivered', 'posted') and new.delivered_at is null then
    new.delivered_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists avesso_track_demand_delivery on public.demands;
create trigger avesso_track_demand_delivery
before insert or update on public.demands
for each row execute function public.avesso_set_demand_delivered_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avesso-profile-images', 'avesso-profile-images', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avesso_profile_images_read on storage.objects;
create policy avesso_profile_images_read
on storage.objects for select to authenticated
using (
  bucket_id = 'avesso-profile-images'
  and public.has_org_role(
    (storage.foldername(name))[1]::uuid,
    array['super_admin'::public.app_role,'agency_owner'::public.app_role,'agency_admin'::public.app_role,'team_member'::public.app_role]
  )
);

drop policy if exists avesso_profile_images_insert on storage.objects;
create policy avesso_profile_images_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avesso-profile-images'
  and public.has_org_role(
    (storage.foldername(name))[1]::uuid,
    array['super_admin'::public.app_role,'agency_owner'::public.app_role,'agency_admin'::public.app_role,'team_member'::public.app_role]
  )
);

drop policy if exists avesso_profile_images_update on storage.objects;
create policy avesso_profile_images_update
on storage.objects for update to authenticated
using (
  bucket_id = 'avesso-profile-images'
  and public.has_org_role(
    (storage.foldername(name))[1]::uuid,
    array['super_admin'::public.app_role,'agency_owner'::public.app_role,'agency_admin'::public.app_role,'team_member'::public.app_role]
  )
)
with check (
  bucket_id = 'avesso-profile-images'
  and public.has_org_role(
    (storage.foldername(name))[1]::uuid,
    array['super_admin'::public.app_role,'agency_owner'::public.app_role,'agency_admin'::public.app_role,'team_member'::public.app_role]
  )
);

drop policy if exists avesso_profile_images_delete on storage.objects;
create policy avesso_profile_images_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'avesso-profile-images'
  and public.has_org_role(
    (storage.foldername(name))[1]::uuid,
    array['super_admin'::public.app_role,'agency_owner'::public.app_role,'agency_admin'::public.app_role,'team_member'::public.app_role]
  )
);


create index if not exists demands_responsible_member_id_idx on public.demands (responsible_member_id);
