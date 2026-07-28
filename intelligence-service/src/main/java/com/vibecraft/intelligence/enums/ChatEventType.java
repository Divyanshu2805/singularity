package com.vibecraft.intelligence.enums;

/**
 * The kinds of step an assistant turn is made of.
 *
 * <p>Handles: naming them - a thought, a plain message, a checklist item announced before writing, a file written, a
 * file deleted (how a rename gets rid of the old copy), a teaching-mode lesson, and a tool log.
 *
 * <p>The column these are stored in carries no check constraint, so adding a value here needs no migration - see the
 * entity for why that matters.
 */
public enum ChatEventType {
    THOUGHT,
    MESSAGE,
    TODO,
    FILE_EDIT,
    FILE_DELETE,
    LEARN,
    TOOL_LOG
}
