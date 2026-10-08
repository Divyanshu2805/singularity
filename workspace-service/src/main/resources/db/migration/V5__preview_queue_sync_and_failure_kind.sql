-- A preview that keeps up by itself, waits in line for a runner, and says what kind of thing went wrong.
--
-- failure_kind names the cause of a failed start (PreviewFailureKind: INSTALL, DEV_SERVER, TIMEOUT, CAPACITY,
-- PLATFORM). The browser used to work that out by matching the opening words of `detail`, so rewording a sentence
-- changed whether a failed start was tried again. Like every enum column here it carries no CHECK constraint.
--
-- synced_revision_id is the project file revision the runner's files were last brought up to, and sync_detail is
-- the step in progress while a newer one is being applied. A running preview whose synced revision is not the
-- project's current one is "Updating"; equal is "Up to date". Both are null on rows from before this migration,
-- which reads as up to date for a project that has never had a revision and as updating - once, until the next
-- sweep brings it level - for one that has.
--
-- No column is needed for waiting in line: a row that is CREATING with no pod_name is waiting for a runner, and
-- pod_name was already nullable.
ALTER TABLE previews ADD COLUMN failure_kind VARCHAR(32);
ALTER TABLE previews ADD COLUMN synced_revision_id BIGINT;
ALTER TABLE previews ADD COLUMN sync_detail VARCHAR(200);
