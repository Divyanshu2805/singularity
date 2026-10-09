-- Published apps: a production build of one revision of a project, served at a stable public link.
--
-- One row per project that has ever been published, so the link (slug) stays the project's across unpublish and
-- republish. What is being served is the live_* group; a build in progress, or the last one that failed, is the
-- build_* and failure_* groups, kept apart so an update that fails leaves the live app untouched.
--
-- status is PublishStatus (LIVE, UNPUBLISHED) and build_status is PublishBuildStatus (BUILDING, FAILED, or null when
-- no build is under way); failure_kind is PublishFailureKind. Like every enum column here they carry no CHECK
-- constraint. live_prefix and retired_prefix are storage prefixes inside the published-apps bucket: a retired prefix
-- is a build that no longer serves and is deleted once retired_at is a couple of minutes old.
--
-- build_number counts the builds ever started for the row and names the storage prefix of each (b<N>/). The claim of a
-- build is a conditional update on build_status, so two presses of Publish cannot start two builds.
CREATE TABLE published_apps (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL UNIQUE REFERENCES projects (id),
    slug VARCHAR(63) NOT NULL UNIQUE,
    status VARCHAR(32) NOT NULL,
    live_prefix VARCHAR(100),
    live_revision_id BIGINT,
    live_file_count INTEGER,
    live_bytes BIGINT,
    published_by_user_id BIGINT,
    published_at TIMESTAMP,
    build_number BIGINT NOT NULL DEFAULT 0,
    build_status VARCHAR(32),
    build_revision_id BIGINT,
    build_detail VARCHAR(200),
    build_pod_name VARCHAR(255),
    build_started_by_user_id BIGINT,
    build_started_at TIMESTAMP,
    build_heartbeat_at TIMESTAMP,
    build_owner VARCHAR(255),
    failure_kind VARCHAR(32),
    failure_detail VARCHAR(500),
    failure_log TEXT,
    retired_prefix VARCHAR(100),
    retired_at TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
CREATE INDEX idx_published_apps_status ON published_apps (status);
CREATE INDEX idx_published_apps_build_status ON published_apps (build_status);
