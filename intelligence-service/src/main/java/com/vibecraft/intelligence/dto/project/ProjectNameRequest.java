package com.vibecraft.intelligence.dto.project;

/** {@code userId} nullable - the caller supplies it so the AI call gets billed to someone; a request with
 *  none simply isn't billed (see ProjectNameGenerator's own javadoc for why this can't be read from context
 *  here the way an authenticated request's usage recording normally is). */
public record ProjectNameRequest(String prompt, Long userId) {
}
