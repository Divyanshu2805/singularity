package com.singularity.intelligence.enums;

/**
 * The kinds of step an assistant turn is made of.
 *
 * <p>Handles: naming them - a thought, a plain message, a checklist item announced before writing, a file written, a
 * file deleted (how a rename gets rid of the old copy), a change to part of a file, a teaching-mode lesson, a tool log, a question put to the
 * user when a request cannot be built correctly without their answer, and the model's own working-out before it
 * answered. A thought is the server's line about the turn as a whole - how long it took and how it ended - and
 * thinking is what the model wrote; the two are different things with unfortunately similar names.
 *
 * <p>A change to part of a file is never stored. It exists between reading the model's answer and saving the turn:
 * by then it has been applied to the file it changes and has become that file, written ({@code FILE_EDIT}), or it
 * could not be applied and was dropped with a note saying so.
 *
 * <p>The column these are stored in carries no check constraint, so adding a value here needs no migration - see the
 * entity for why that matters.
 */
public enum ChatEventType {
    THOUGHT,
    MESSAGE,
    TODO,
    FILE_EDIT,
    FILE_PATCH,
    FILE_DELETE,
    LEARN,
    TOOL_LOG,
    ASK,
    THINKING
}
