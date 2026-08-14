-- BILL-01: a user-scoped, idempotency-key-bearing checkout attempt, so a double click or a parallel tab reuses the
-- same in-flight Stripe Checkout Session instead of minting a second one. Keyed on user_id itself so at most one
-- outstanding intent per user is enforced by the primary key, not a race-prone existence check.

CREATE TABLE checkout_intents (
    user_id BIGINT PRIMARY KEY REFERENCES users (id),
    plan_id BIGINT NOT NULL REFERENCES plans (id),
    idempotency_key VARCHAR(64) NOT NULL,
    stripe_session_id VARCHAR(255),
    updated_at TIMESTAMP
);
