-- Baseline schema for account-service, matching the entities in com.vibecraft.account.entity exactly.
-- Flyway-managed from day one (see the migration plan's decision to introduce it here rather than carry
-- ddl-auto: update's persisted-enum trap into a fresh database) — validate against this in the same change
-- if you add or change a field, rather than letting Hibernate widen anything silently.

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    firebase_uid VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP,
    CONSTRAINT uk_users_username UNIQUE (username),
    CONSTRAINT uk_users_firebase_uid UNIQUE (firebase_uid),
    CONSTRAINT uk_users_stripe_customer_id UNIQUE (stripe_customer_id)
);

CREATE TABLE plans (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    stripe_price_id VARCHAR(255),
    max_projects INTEGER,
    max_tokens_per_day INTEGER,
    max_previews INTEGER,
    unlimited_ai BOOLEAN,
    active BOOLEAN,
    price_amount_minor INTEGER,
    currency VARCHAR(255),
    billing_interval VARCHAR(255),
    tagline VARCHAR(255),
    sort_order INTEGER,
    CONSTRAINT uk_plans_stripe_price_id UNIQUE (stripe_price_id)
);

CREATE TABLE subscriptions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id),
    plan_id BIGINT NOT NULL REFERENCES plans (id),
    status VARCHAR(255) NOT NULL,
    stripe_subscription_id VARCHAR(255),
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    cancel_at_period_end BOOLEAN,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE password_reset_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id),
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP,
    CONSTRAINT uk_password_reset_tokens_token_hash UNIQUE (token_hash)
);

CREATE TABLE auth_audit_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT,
    firebase_uid VARCHAR(128),
    type VARCHAR(64) NOT NULL,
    ip_address VARCHAR(64),
    user_agent VARCHAR(255),
    detail VARCHAR(255),
    created_at TIMESTAMP
);

CREATE INDEX idx_auth_audit_user_created ON auth_audit_events (user_id, created_at);

CREATE TABLE revoked_sessions (
    cookie_hash VARCHAR(64) PRIMARY KEY,
    expires_at TIMESTAMP NOT NULL
);
