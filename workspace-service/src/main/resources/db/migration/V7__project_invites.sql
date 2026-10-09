-- An invitation is held by email address until the person it names accepts it.
--
-- Until now inviting someone wrote their project_members row straight away: they had the role before they had
-- agreed to anything, and the endpoint answered 404 for an address with no account, which told any project owner
-- whether an address was registered. An invitation now lives here, keyed by the address as typed (lower-cased),
-- whether or not an account exists for it, and becomes a project_members row only when someone signed in with
-- that address accepts. Sign-in requires a verified email, so holding the address is what proves the invite is
-- theirs.
--
-- invited_by is a plain id with no foreign key, like every user reference in this database. project_role carries
-- no CHECK constraint, like every enum column here.
--
-- Every membership that exists today was usable from the moment it was written, so the rows whose accepted_at
-- was never filled in are marked accepted as of their invitation. From here on a project_members row exists only
-- for someone who has accepted.
--
-- Numbered 7 because the publishing work, written at the same time on its own branch, holds 6.
CREATE TABLE project_invites (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects (id),
    email VARCHAR(320) NOT NULL,
    project_role VARCHAR(255) NOT NULL,
    invited_by BIGINT NOT NULL,
    invited_at TIMESTAMP NOT NULL,
    CONSTRAINT uq_project_invites_project_email UNIQUE (project_id, email)
);

CREATE INDEX idx_project_invites_email ON project_invites (email);

UPDATE project_members SET accepted_at = COALESCE(invited_at, now()) WHERE accepted_at IS NULL;
