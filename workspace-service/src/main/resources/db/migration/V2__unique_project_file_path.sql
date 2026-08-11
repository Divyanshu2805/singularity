-- CODE_REVIEW.md DATA-01: project_files had no uniqueness constraint on (project_id, path), so concurrent writes
-- for the same file could create duplicate metadata rows - an ambiguous "which row is the file", and a project
-- with duplicates could not even be exported: ZipOutputStream throws outright on two ZipEntry with the same name.
--
-- Keeps the most recently touched row per (project_id, path) and removes the rest before the constraint is added,
-- so this migration is safe to run even if duplicates already exist in a given environment. Ties (equal or null
-- updated_at/created_at) are broken by the highest id, which is always the most recently inserted row.
DELETE FROM project_files pf
USING project_files newer
WHERE pf.project_id = newer.project_id
  AND pf.path = newer.path
  AND pf.id <> newer.id
  AND (COALESCE(pf.updated_at, pf.created_at, TIMESTAMP '1970-01-01'), pf.id)
    < (COALESCE(newer.updated_at, newer.created_at, TIMESTAMP '1970-01-01'), newer.id);

ALTER TABLE project_files ADD CONSTRAINT uq_project_files_project_id_path UNIQUE (project_id, path);
