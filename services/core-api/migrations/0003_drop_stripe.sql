-- Stripe billing removed. The subscriptions table stays (tier/status drive the
-- premium gate + scan quota), but the Stripe-specific columns are dropped — a
-- workspace's tier is now set internally rather than via a payment provider.

ALTER TABLE core.subscriptions DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE core.subscriptions DROP COLUMN IF EXISTS stripe_subscription_id;
ALTER TABLE core.subscriptions DROP COLUMN IF EXISTS current_period_end;
ALTER TABLE core.subscriptions DROP COLUMN IF EXISTS cancel_at_period_end;

DROP INDEX IF EXISTS core.idx_core_subscriptions_stripe_sub;
