package com.singularity.workspace.enums;

/**
 * What kind of thing stopped a preview from starting.
 *
 * <p>Handles: naming the causes - the project's packages would not install, its dev server would not run, the start
 * ran out of time, no runner came free, or the platform under the preview failed.
 *
 * <p>The browser decides from this whether a failed start is worth trying again by itself: a platform failure is,
 * because nothing in the project caused it, and the others are not, because repeating them repeats the result. It
 * used to decide by matching the opening words of the failure's sentence, which broke whenever a sentence was
 * reworded. Like every other enum column here, the previews table carries no check constraint listing these values.
 */
public enum PreviewFailureKind {
    INSTALL, DEV_SERVER, TIMEOUT, CAPACITY, PLATFORM
}
