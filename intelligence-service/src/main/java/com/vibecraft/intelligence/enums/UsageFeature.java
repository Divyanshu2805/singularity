package com.vibecraft.intelligence.enums;

/**
 * What an AI call was for, so usage can be broken down by where the tokens went.
 *
 * <p>Handles: naming each one - a build turn, the automatic retry after a turn announced an edit and delivered none,
 * the code lens, and the pre-project idea interview. Project naming is part of the recorded vocabulary but nothing
 * writes it today: project names come from a local heuristic with no model call.
 *
 * <p>Persisted as a plain string of the name - see the usage-event entity for why an enum column mapping would make
 * adding a value here break every insert of it.
 */
public enum UsageFeature {
    BUILD,
    BUILD_RETRY,
    EXPLAIN,
    IDEA_INTERVIEW,
    PROJECT_NAMING
}
