ALTER TABLE public.client_monthly_plans
  ADD COLUMN IF NOT EXISTS approval_deadline date;
