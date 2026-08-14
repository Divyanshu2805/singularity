-- BILL-05: when the row most recently entered PAST_DUE, so entitlement can apply a finite grace window instead of
-- treating a permanently unpaid subscription as forever-entitling.
ALTER TABLE subscriptions ADD COLUMN past_due_since TIMESTAMP;

-- BILL-04: set when a plan-change's Stripe write succeeded but the immediate re-read back from Stripe failed, so a
-- 200 response never implies the local mirror is known-current. Cleared the next time Stripe state is successfully
-- read back, whether by a live sync or the next webhook.
ALTER TABLE subscriptions ADD COLUMN sync_pending BOOLEAN NOT NULL DEFAULT false;
