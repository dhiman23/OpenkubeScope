-- KubeScope subscriptions table
-- Tracks per-workspace subscription state (free vs unlimited) reconciled via Stripe webhooks

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free','unlimited')),
  status text not null default 'inactive' check (status in ('inactive','active','trialing','past_due','canceled','incomplete')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id)
);

create index if not exists idx_subscriptions_workspace on public.subscriptions(workspace_id);
create index if not exists idx_subscriptions_stripe_customer on public.subscriptions(stripe_customer_id);
create index if not exists idx_subscriptions_stripe_subscription on public.subscriptions(stripe_subscription_id);

alter table public.subscriptions enable row level security;

drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription" on public.subscriptions
  for select using (
    workspace_id in (select id from public.workspaces where user_id = auth.uid())
  );

-- Only service-role writes are permitted (webhook uses service role key).
-- No INSERT/UPDATE/DELETE policy is added intentionally — service role bypasses RLS.

create or replace function public.set_subscriptions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute procedure public.set_subscriptions_updated_at();
