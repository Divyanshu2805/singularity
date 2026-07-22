-- intelligence-service's schema, matching entity/ChatSession.java, ChatMessage.java, ChatEvent.java,
-- CodeNote.java, UsageEvent.java, UsageLog.java exactly. Flyway owns this schema (ddl-auto: validate) - no
-- CHECK constraints on any enum-backed column, same reasoning as account-service's/workspace-service's own
-- Flyway migrations (see docs/schema/conventions.md, "Enum columns carry no CHECK constraint").

-- project_id/user_id plain columns, no FK: Project lives in workspace-service's own database, User in
-- account-service's - neither is ever joinable locally.
CREATE TABLE chat_sessions (
    project_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP,
    PRIMARY KEY (project_id, user_id)
);

-- chat_messages' FK into chat_sessions IS a real composite FK - both tables live in this one service/database.
CREATE TABLE chat_messages (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    content TEXT,
    role VARCHAR(255) NOT NULL,
    tokens_used INTEGER,
    created_at TIMESTAMP,
    FOREIGN KEY (project_id, user_id) REFERENCES chat_sessions (project_id, user_id)
);

CREATE TABLE chat_events (
    id BIGSERIAL PRIMARY KEY,
    chat_message_id BIGINT NOT NULL REFERENCES chat_messages (id),
    type VARCHAR(255) NOT NULL,
    sequence_order INTEGER NOT NULL,
    content TEXT,
    file_path VARCHAR(255),
    metadata TEXT,
    previous_content TEXT
);

-- project_id/user_id plain columns, no FK - same reasoning as chat_sessions above.
CREATE TABLE code_notes (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    selection_path VARCHAR(255),
    selection_code TEXT,
    selection_start_line INTEGER,
    selection_end_line INTEGER,
    created_at TIMESTAMP
);
CREATE INDEX idx_code_notes_project_user ON code_notes (project_id, user_id);

CREATE TABLE usage_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    project_id BIGINT,
    feature VARCHAR(32) NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_usage_events_user_created ON usage_events (user_id, created_at);

CREATE TABLE usage_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    date DATE NOT NULL,
    tokens_used INTEGER,
    UNIQUE (user_id, date)
);
