-- CODE_REVIEW.md PRE-03: on startup, every CREATING preview used to be failed unconditionally, on the assumption
-- that only a restart of this same process could have left one mid-start. A rolling deployment breaks that
-- assumption - a new instance coming up while an older one is still finishing a bootstrap it owns would fail that
-- still-live work out from under it.
--
-- bootstrap_heartbeat_at is written once when a bootstrap claims a preview and refreshed while it polls; startup
-- now only fails a CREATING row whose heartbeat is missing or old enough that the instance that owned it can no
-- longer be running. bootstrap_owner carries no decision logic - staleness is judged by time, not identity, since
-- two instances' clocks are never perfectly comparable either - it exists purely so a stale row's log line says
-- which instance last touched it.
ALTER TABLE previews ADD COLUMN bootstrap_owner VARCHAR(64);
ALTER TABLE previews ADD COLUMN bootstrap_heartbeat_at TIMESTAMP;
