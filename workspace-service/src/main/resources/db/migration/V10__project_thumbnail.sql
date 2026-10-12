-- When a project's picture was last taken.
--
-- A project's card showed a wash of colour made from its name. It can now show a small picture of the app itself,
-- taken by the previewed page and stored once per project in object storage (ThumbnailStore). thumbnail_at says that
-- there is one and when it was stored: null means the card keeps its colours, and the time is what the browser adds
-- to the picture's address so a newer picture is fetched and an unchanged one is not.
--
-- The picture itself is not in the database. Setting this column does not touch updated_at: a new picture is not an
-- edit of the project.
ALTER TABLE projects
    ADD COLUMN thumbnail_at TIMESTAMP;
