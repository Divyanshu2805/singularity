-- workspace-service's schema, matching entity/Project.java, ProjectMember.java, ProjectFile.java, Preview.java,
-- PreviewSession.java exactly. Flyway owns this schema (ddl-auto: validate) - see docs/schema/'s
-- "Persisted enums and the ddl-auto trap" for why no @Enumerated(STRING) column below has a CHECK constraint:
-- this is a brand-new database via a brand-new migration, so there is no ddl-auto:update-generated constraint
-- to begin with, and writing one back in by hand would just recreate the exact trap Flyway exists to avoid
-- (previews.status has already grown a 4th value once in legacy-monolith's own history).

CREATE TABLE projects (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    is_public BOOLEAN,
    template_init_issue VARCHAR(255),
    forked_from_project_id BIGINT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);
CREATE INDEX idx_projects_updated_at_desc ON projects (updated_at DESC, deleted_at);
CREATE INDEX idx_projects_deleted_at_updated_at_desc ON projects (deleted_at, updated_at DESC);
CREATE INDEX idx_project_deleted_at ON projects (deleted_at);

-- user_id is a plain column, no FK: User lives in account-service's own database now, never joinable locally.
CREATE TABLE project_members (
    project_id BIGINT NOT NULL REFERENCES projects (id),
    user_id BIGINT NOT NULL,
    project_role VARCHAR(255) NOT NULL,
    invited_at TIMESTAMP,
    accepted_at TIMESTAMP,
    pinned_at TIMESTAMP,
    starred_at TIMESTAMP,
    PRIMARY KEY (project_id, user_id)
);

-- No created_by/updated_by: confirmed dead in every reader before dropping (see entity/ProjectFile.java's comment).
CREATE TABLE project_files (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects (id),
    path VARCHAR(255) NOT NULL,
    minio_object_key VARCHAR(255),
    size BIGINT,
    type VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE previews (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects (id),
    namespace VARCHAR(255),
    pod_name VARCHAR(255),
    preview_url VARCHAR(255),
    hostname VARCHAR(255),
    started_by_user_id BIGINT,
    status VARCHAR(255) NOT NULL,
    detail VARCHAR(500),
    failure_log TEXT,
    started_at TIMESTAMP,
    ready_at TIMESTAMP,
    last_accessed_at TIMESTAMP,
    terminated_at TIMESTAMP,
    created_at TIMESTAMP
);
CREATE INDEX idx_previews_project_id ON previews (project_id);
CREATE INDEX idx_previews_status ON previews (status);

CREATE TABLE preview_sessions (
    id BIGSERIAL PRIMARY KEY,
    preview_id BIGINT NOT NULL REFERENCES previews (id),
    project_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    started_at TIMESTAMP,
    last_seen_at TIMESTAMP,
    ended_at TIMESTAMP,
    end_reason VARCHAR(500),
    failed BOOLEAN
);
CREATE INDEX idx_preview_sessions_project_user ON preview_sessions (project_id, user_id);
CREATE INDEX idx_preview_sessions_preview_id ON preview_sessions (preview_id);
CREATE INDEX idx_preview_sessions_user_ended ON preview_sessions (user_id, ended_at);
