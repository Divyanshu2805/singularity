-- Firebase is the only sign-in method, so no password is ever set or verified here: the column only ever held a
-- BCrypt hash of a random secret, written once at account creation to satisfy its own NOT NULL constraint and
-- never read. Dropping it removes the last trace of the pre-Firebase local-password login.
ALTER TABLE users DROP COLUMN password;
