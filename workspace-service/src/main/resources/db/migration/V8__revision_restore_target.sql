-- A revision made by going back records what it went back to.
--
-- A restore was stored as a revision like any other, with nothing to say which earlier one it had put the project
-- back to, so the History panel could only call it "Went back to an earlier version" - three of those in a row, and
-- nobody could tell which version the project was on. restored_revision_id names the revision that was chosen, and
-- restored_before says whether the project was put back to how it stood just before that revision (Undo on a chat
-- reply) rather than just after it (Go back in History). Both are null on every other kind of revision, and on
-- restores made before this column existed.
--
-- restored_revision_id is a plain id with no foreign key: it is a label for the History panel, read back and matched
-- against the list the panel already has, and nothing joins on it.
ALTER TABLE project_file_revisions
    ADD COLUMN restored_revision_id BIGINT,
    ADD COLUMN restored_before BOOLEAN;
