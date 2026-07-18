package com.vibecraft.intelligence.enums;

public enum ChatEventType {
    THOUGHT,
    MESSAGE,
    /** One step of the build checklist the model announces before it starts writing files. */
    TODO,
    FILE_EDIT,
    /**
     * A file the model removed ({@code <delete path="...">}) - how a rename or move gets rid of the old copy. Stored
     * as varchar with no CHECK constraint (see {@code ChatEvent.type}), so this new value needs no migration.
     */
    FILE_DELETE,
    /**
     * Teaching mode only: a plain-English note on the concept the file just written uses, and why. {@code filePath}
     * is that file, {@code metadata} the concept's name.
     */
    LEARN,
    TOOL_LOG
}
