-- A short title for each message a person sends in the build chat, written by a model in at most eight words. The
-- chat's scroll rail lists a conversation's messages by it; null until one is written, when the rail shows the
-- message's first line.
ALTER TABLE chat_messages
    ADD COLUMN title VARCHAR(120);
