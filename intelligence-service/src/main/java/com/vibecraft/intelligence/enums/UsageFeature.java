package com.vibecraft.intelligence.enums;

/**
 * What an AI call was for, so usage can be broken down by where the tokens went.
 *
 * <p>Persisted on {@code UsageEvent.feature} as a plain String of its name - see that field for why an enum column
 * mapping would make adding a value here break inserts, the way adding {@code ChatEventType.TODO} once did.
 */
public enum UsageFeature {
    /** A build turn in the project chat. */
    BUILD,
    /** The automatic second attempt after a turn announced an edit and delivered none. */
    BUILD_RETRY,
    /** ExplainLLM - explaining or answering questions about code. */
    EXPLAIN,
    /** The pre-project idea interview: its questions and the compiled brief. */
    IDEA_INTERVIEW,
    /** Naming a new project from its idea. */
    PROJECT_NAMING
}
