package com.singularity.intelligence.enums;

/**
 * The kinds of call this service makes to a model, as far as choosing a model and its reasoning effort goes.
 *
 * <p>Handles: naming each one - writing a build turn's reply or carrying one on; repairing what a check of the written
 * files found; the idea interview and its compiled brief; a step lesson; an explanation or a question about code; and
 * the suggestions offered under a finished build.
 *
 * <p>This is not {@link UsageFeature}. That says what a call is billed as, and a repair is billed as a retry of the
 * build; this says what the call needs from a model, and a repair - a few lines to mend, with the fault spelled out -
 * needs far less than the build that came before it.
 */
public enum AiCallKind {
    BUILD,
    REPAIR,
    INTERVIEW,
    LESSON,
    EXPLAIN,
    SUGGEST
}
