-- BILL-02: a Stripe subscription id must back at most one row here - without this, a checkout-confirmation and a
-- checkout.session.completed webhook racing each other could both pass the old existence-then-insert check and
-- create two rows for the same Stripe subscription.
ALTER TABLE subscriptions ADD CONSTRAINT uk_subscriptions_stripe_subscription_id UNIQUE (stripe_subscription_id);

-- A user has at most one non-terminal subscription at a time - active, trialing, past due or still-incomplete.
-- CANCELED rows are history and are exempt, so a user can resubscribe after cancelling. This is what makes
-- findByUserIdAndStatusIn's single-result assumption safe: without it, two concurrently-active rows for the same
-- user would make that query throw at read time instead of failing loudly at write time.
CREATE UNIQUE INDEX uk_subscriptions_user_non_terminal ON subscriptions (user_id) WHERE status <> 'CANCELED';
