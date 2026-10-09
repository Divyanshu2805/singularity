-- A reply that changed files records the revision those files were published as, so the chat can offer to undo
-- exactly that turn and the history can name each revision by the request that made it. Null on a turn that wrote
-- nothing and on every turn saved before this column existed.
ALTER TABLE chat_messages ADD COLUMN revision_id BIGINT;
