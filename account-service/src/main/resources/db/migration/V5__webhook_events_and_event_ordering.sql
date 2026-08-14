-- BILL-03: a durable inbox of Stripe webhook deliveries by their own event id, so a redelivered or concurrently
-- retried event never re-applies its side effects once already fully processed, and one still stuck at RECEIVED
-- (in flight, or its handler threw) stays reclaimable by a retry rather than being dropped forever.
CREATE TABLE webhook_events (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(100) NOT NULL,
    status VARCHAR(32) NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- BILL-03: the timestamp of the last Stripe event actually applied to this row, so a delayed or out-of-order
-- webhook (e.g. a stale customer.subscription.updated arriving after a later customer.subscription.deleted already
-- cancelled the row) can be detected and dropped instead of overwriting newer state with older state.
ALTER TABLE subscriptions ADD COLUMN last_event_at TIMESTAMP;
