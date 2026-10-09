-- Teaching mode opens a turn with the big picture before any step's lesson: what was asked for, the pieces the turn
-- built and how they work together. Like a step's lesson it is written once, when first shown, and kept on the reply.
ALTER TABLE chat_messages ADD COLUMN overview TEXT;
