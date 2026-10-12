-- A line saying what a project is, beside its name.
--
-- A project's name used to be the first few words of what its owner typed ("Guestbook everyone who opens"), and it
-- was the only text a project had. The name is now what the app is called, in one or two words ("Guestbook"), since
-- it heads the project's page and is what its published link and its repository are named after; summary is the
-- line the sidebar shows instead - what the app is, in at most eight words ("A guestbook every visitor can sign").
--
-- Null on every project made before this, and on a fork; the sidebar falls back to the name.
ALTER TABLE projects
    ADD COLUMN summary VARCHAR(120);
