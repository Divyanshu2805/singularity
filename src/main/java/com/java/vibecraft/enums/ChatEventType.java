package com.java.vibecraft.enums;

public enum ChatEventType {
    THOUGHT,
    MESSAGE,
    /** One step of the build checklist the model announces before it starts writing files. */
    TODO,
    FILE_EDIT,
    /**
     * Teaching mode only: a plain-English note on the concept the file just written uses, and why. {@code filePath}
     * is that file, {@code metadata} the concept's name.
     */
    LEARN,
    TOOL_LOG
}
