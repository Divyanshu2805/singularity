-- The line saying what a project is becomes the title the app shows for it.
--
-- summary (V11) was meant to be written by the idea interview's model, but nothing passed that suggestion on, so
-- every value here was cut from the first sentence of what the owner typed - and no screen showed it. It is now the
-- title the sidebar, the project's header, its card and search show: written by a model (the interview's, or a call
-- of its own for a project that has none), or the name the owner typed when they renamed the project. The values cut
-- from descriptions are cleared so those projects are titled by a model like the rest; until then the app shows the
-- name.
--
-- Widened to the name's own length, since a rename writes the name the owner typed into it.
UPDATE projects SET summary = NULL;

ALTER TABLE projects
    ALTER COLUMN summary TYPE VARCHAR(255);
