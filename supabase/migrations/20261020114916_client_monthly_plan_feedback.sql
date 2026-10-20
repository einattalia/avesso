alter table public.client_monthly_plans
  add column if not exists client_rating smallint,
  add column if not exists client_feedback text,
  add column if not exists client_feedback_at timestamptz;

alter table public.client_monthly_plans
  drop constraint if exists client_monthly_plans_client_rating_check;
alter table public.client_monthly_plans
  add constraint client_monthly_plans_client_rating_check
  check (client_rating is null or client_rating between 1 and 5);

alter table public.client_monthly_plans
  drop constraint if exists client_monthly_plans_client_feedback_length_check;
alter table public.client_monthly_plans
  add constraint client_monthly_plans_client_feedback_length_check
  check (client_feedback is null or char_length(client_feedback) <= 4000);
