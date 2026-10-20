alter table public.client_monthly_plan_items
  add column if not exists designer_id uuid,
  add column if not exists videomaker_id uuid;

create index if not exists client_monthly_plan_items_designer_idx
  on public.client_monthly_plan_items (designer_id) where designer_id is not null;
create index if not exists client_monthly_plan_items_videomaker_idx
  on public.client_monthly_plan_items (videomaker_id) where videomaker_id is not null;
