-- CODE_REVIEW.md AI-05 / CODE_TODO.md GATE-02: immutable content staging plus an atomically-published revision
-- manifest, so a failed multi-file change leaves the previous version usable and a restore reproduces exact files.
-- The live project_files/MinIO path-keyed layout is untouched by this migration - the K8s preview syncer's
-- `mc mirror` and every existing reader keep working exactly as before. This adds a parallel, append-only history
-- alongside it, backed by a second, content-addressed MinIO bucket (project-blobs) this migration does not touch.
-- See docs/schema/conventions.md's "Revision manifests" section for the full design.

-- One row per attempted change set. parent_revision_id is the optimistic-concurrency base a publish is checked
-- against - both the AI pipeline and (later) manual editing publish through the same claim.
CREATE TABLE project_file_revisions (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects (id),
    parent_revision_id BIGINT REFERENCES project_file_revisions (id),
    status VARCHAR(255) NOT NULL,
    source VARCHAR(255) NOT NULL,
    created_by_user_id BIGINT NOT NULL,
    failure_detail VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    applied_at TIMESTAMP
);
CREATE INDEX idx_project_file_revisions_project_id ON project_file_revisions (project_id, id DESC);

-- The manifest body: one row per path actually changed by that revision - a delta against its parent, not a
-- full-tree snapshot. A snapshot at any revision is reconstructed by walking parent_revision_id back to the root,
-- keeping only the most recent entry per path (see ProjectFileRevisionRepository's recursive query).
CREATE TABLE project_file_revision_entries (
    id BIGSERIAL PRIMARY KEY,
    revision_id BIGINT NOT NULL REFERENCES project_file_revisions (id),
    path VARCHAR(400) NOT NULL,
    change_type VARCHAR(255) NOT NULL,
    content_hash VARCHAR(128),
    previous_content_hash VARCHAR(128),
    size BIGINT,
    content_type VARCHAR(255),
    UNIQUE (revision_id, path)
);
CREATE INDEX idx_project_file_revision_entries_revision_id ON project_file_revision_entries (revision_id);

-- The atomic "what's live" pointer. NULL means no revision has ever been published for this project - true for
-- every project that existed before this migration, until its first post-migration write lazily adopts it.
ALTER TABLE projects ADD COLUMN current_file_revision_id BIGINT REFERENCES project_file_revisions (id);

-- Lets a current file be traced back to the exact blob and revision it came from, without changing path or
-- minio_object_key's existing role - reads still go through the live path key, unchanged.
ALTER TABLE project_files ADD COLUMN content_hash VARCHAR(128);
ALTER TABLE project_files ADD COLUMN current_revision_id BIGINT REFERENCES project_file_revisions (id);
