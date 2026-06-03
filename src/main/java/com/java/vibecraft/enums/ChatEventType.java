package com.java.vibecraft.enums;

public enum ChatEventType {
    THOUGHT,
    MESSAGE,
    /** One step of the build checklist the model announces before it starts writing files. */
    TODO,
    FILE_EDIT,
    TOOL_LOG
}
