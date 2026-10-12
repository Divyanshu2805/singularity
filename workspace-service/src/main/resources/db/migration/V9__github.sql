-- A person's connection to their GitHub account, and the repository a project has been pushed to.
--
-- github_connections holds one row per user who has connected GitHub. The access token is stored encrypted
-- (AES-256-GCM, key from the GITHUB_TOKEN_KEY secret) and is never returned by any endpoint; the row is deleted when
-- the person disconnects. user_id is a plain id with no foreign key, like every user reference in this database -
-- users live in account-service's database.
--
-- project_github_repos holds one row per project that has been pushed: which repository, and what was pushed last.
-- The repository is kept by its GitHub id as well as its name, because a repository can be renamed there and its id
-- cannot. Removing the row forgets the link and leaves the repository on GitHub alone; this service never deletes a
-- repository. pushed_by is who made the link, again a plain id.
CREATE TABLE github_connections (
    user_id BIGINT PRIMARY KEY,
    github_user_id BIGINT NOT NULL,
    login VARCHAR(100) NOT NULL,
    access_token_cipher TEXT NOT NULL,
    scopes VARCHAR(255),
    connected_at TIMESTAMP NOT NULL
);

CREATE TABLE project_github_repos (
    project_id BIGINT PRIMARY KEY REFERENCES projects (id),
    pushed_by BIGINT NOT NULL,
    repo_id BIGINT NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    html_url VARCHAR(500) NOT NULL,
    default_branch VARCHAR(255) NOT NULL,
    is_private BOOLEAN NOT NULL,
    last_commit_sha VARCHAR(64),
    last_pushed_revision_id BIGINT,
    last_pushed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL
);
