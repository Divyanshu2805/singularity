package com.vibecraft.workspace.enums;

/**
 * The states a live preview passes through.
 *
 * <p>Handles: naming them - starting, running, failed to start, and ended.
 *
 * <p>Like every other enum column in this codebase, the previews table carries no database check constraint listing
 * these values (see docs/schema/conventions.md, "Enum columns carry no CHECK constraint") - this column has already grown a
 * fourth value once with no migration needed for it.
 */
public enum PreviewStatus {
    CREATING, RUNNING, FAILED, TERMINATED
}
