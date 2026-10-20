create index if not exists client_monthly_plan_items_plan_tenant_fk_idx on public.client_monthly_plan_items (plan_id, organization_id, client_id);
create index if not exists client_monthly_plan_events_organization_id_idx on public.client_monthly_plan_item_events (organization_id);
create index if not exists client_monthly_plan_events_client_id_idx on public.client_monthly_plan_item_events (client_id);
