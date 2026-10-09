package com.singularity.intelligence.enums;

/**
 * How much code the person reading an explanation already knows.
 *
 * <p>Handles: naming the three levels teaching mode and the code lens write for - someone who has never coded,
 * someone who has written a little, and a developer who is new only to this project.
 *
 * <p>It is the person's own choice, sent with each request for an explanation and never stored on the server. It
 * only selects one of three fixed paragraphs in a prompt, so nothing typed in the browser reaches the model through
 * it; a value that is not one of these is refused when the request is read. A request without one is written for
 * someone new to code, which is who the product is for.
 */
public enum LearnerLevel {
    NEW,
    SOME,
    DEVELOPER;

    public static LearnerLevel orDefault(LearnerLevel level) {
        return level == null ? NEW : level;
    }
}
