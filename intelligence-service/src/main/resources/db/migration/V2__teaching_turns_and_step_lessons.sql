-- Teaching mode belongs to a turn, not to the browser: the reply records whether it was asked for with the mode on,
-- and each file a turn wrote keeps the lesson written about its change once somebody has opened it.
ALTER TABLE chat_messages ADD COLUMN teaching BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE chat_events ADD COLUMN lesson TEXT;
