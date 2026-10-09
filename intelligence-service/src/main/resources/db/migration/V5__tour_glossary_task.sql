-- A project's tour, its glossary and a step's "try changing this" task. All three are written once, when the person
-- asks for them, and kept: the tour per project and person, a glossary term per project and person, a task on the
-- file edit it was set from. A task is marked done when the read-only model has looked at the file and found the
-- change made.
CREATE TABLE project_tours (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT uq_project_tours_project_user UNIQUE (project_id, user_id)
);

CREATE TABLE glossary_entries (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    term VARCHAR(80) NOT NULL,
    term_key VARCHAR(80) NOT NULL,
    definition TEXT NOT NULL,
    created_at TIMESTAMP,
    CONSTRAINT uq_glossary_entries_project_user_term UNIQUE (project_id, user_id, term_key)
);

ALTER TABLE chat_events ADD COLUMN task TEXT;
ALTER TABLE chat_events ADD COLUMN task_done BOOLEAN NOT NULL DEFAULT FALSE;
