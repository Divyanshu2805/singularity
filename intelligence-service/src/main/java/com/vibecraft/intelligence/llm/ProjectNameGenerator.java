package com.vibecraft.intelligence.llm;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Turns the description a user types on the dashboard into a short plain description used as the
 * project's name (e.g. "Habit tracker with daily streaks"), rather than a made-up brand name. Falls back
 * to a keyword heuristic when the AI call fails, so project creation never blocks on naming.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ProjectNameGenerator {

    private static final int MAX_NAME_LENGTH = 60;
    private static final int MAX_WORDS = 6;
    private static final int FALLBACK_WORDS = 5;
    private static final int MAX_PROMPT_CHARS = 1000;
    private static final String FALLBACK_NAME = "Untitled project";

    private static final String SYSTEM_PROMPT = """
            You label software projects. Given a description of an app someone wants to build, reply with a plain
            4 to 5 word description of what the project is, for example "Habit tracker with daily streaks" or
            "Landing page for coffee shop". Never invent a brand-style or catchy name. Use sentence case (capitalize
            only the first word and proper nouns), no quotes, no trailing punctuation, no emojis.
            Reply with the description only, nothing else.
            """;

    private static final Pattern LEADING_FILLER = Pattern.compile(
            "^(?:(?:please|can you|could you|i want(?: to)?|i need|i'd like(?: to)?|help me|let's|lets|build|create|make|"
                    + "generate|design|develop|code|write|me|us|a|an|the|new)\\s+)+",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern DESCRIPTION_BOUNDARY = Pattern.compile(
            "\\s+(?:that|which|where|so that)\\s+|[,.;:!?\\n]", Pattern.CASE_INSENSITIVE);
    // A description shouldn't end mid-phrase, e.g. "Todo app with drag and".
    private static final Set<String> TRAILING_STOPWORDS = Set.of(
            "and", "or", "with", "for", "to", "of", "in", "on", "the", "a", "an", "my", "our", "using", "by");

    private final ChatClient chatClient;
    private final AiUsageRecorder aiUsageRecorder;

    /** For a caller on the request thread with a real signed-in user in context (unused today, kept for
     *  parity with how every other AI call path in this service works - see the {@code userId}-taking
     *  overload below for the one real caller, {@code InternalIntelligenceController}, which has none). */
    public String generateName(String prompt) {
        return generateName(prompt, null);
    }

    /**
     * {@code userId} explicit rather than read from context: this is called from
     * {@code InternalIntelligenceController}, a machine-to-machine {@code /internal/v1/**} endpoint guarded by
     * the shared internal-service secret, not a signed-in user's session - {@code AuthUtil.getCurrentUserId()}
     * has nothing to read there. Found by manually exercising the endpoint during this phase's verification:
     * the AI call itself succeeded, but billing silently no-op'd (the 3-arg {@code AiUsageRecorder} overload
     * swallows its own failure to read the caller, by design, so nothing failed loudly - it just never charged
     * anyone). Same reasoning as {@code AiUsageRecorder}'s own two-overload split for stream-completion
     * callbacks off the request thread.
     */
    public String generateName(String prompt, Long userId) {
        String trimmedPrompt = prompt.strip();
        try {
            ChatResponse response = chatClient.prompt()
                    .system(SYSTEM_PROMPT)
                    .user(trimmedPrompt.substring(0, Math.min(trimmedPrompt.length(), MAX_PROMPT_CHARS)))
                    .call()
                    .chatResponse();
            if (userId != null) {
                aiUsageRecorder.record(response, com.vibecraft.intelligence.enums.UsageFeature.PROJECT_NAMING, userId, null);
            } else {
                aiUsageRecorder.record(response, com.vibecraft.intelligence.enums.UsageFeature.PROJECT_NAMING, null);
            }
            String raw = response == null || response.getResult() == null ? null : response.getResult().getOutput().getText();
            String name = sanitize(raw);
            if (!name.isEmpty()) {
                return name;
            }
            log.warn("AI returned an unusable project name ({}), falling back to heuristic naming", raw);
        } catch (Exception e) {
            log.warn("AI project naming failed, falling back to heuristic naming", e);
        }
        return fallbackName(trimmedPrompt);
    }

    private String sanitize(String raw) {
        if (raw == null) {
            return "";
        }
        String firstLine = raw.strip().lines().findFirst().orElse("");
        String cleaned = firstLine
                .replaceAll("[\"'`*_#]", "")
                .replaceAll("^(?i)(project name|project description|description|name)\\s*:\\s*", "")
                .replaceAll("[.!?,;:]+$", "")
                .replaceAll("\\s+", " ")
                .strip();
        return finish(cleaned.isEmpty() ? List.of() : Arrays.asList(cleaned.split(" ")), MAX_WORDS);
    }

    private String fallbackName(String prompt) {
        String subject = LEADING_FILLER.matcher(prompt).replaceFirst("");
        subject = DESCRIPTION_BOUNDARY.split(subject, 2)[0];
        List<String> words = Arrays.stream(subject.split("\\s+")).filter(word -> !word.isBlank()).toList();
        String name = finish(words, FALLBACK_WORDS);
        return name.isBlank() ? FALLBACK_NAME : name;
    }

    /** Caps the word count, drops dangling connector words, capitalizes the first letter, and caps the length. */
    private String finish(List<String> words, int maxWords) {
        List<String> kept = new ArrayList<>(words.subList(0, Math.min(words.size(), maxWords)));
        while (!kept.isEmpty() && TRAILING_STOPWORDS.contains(kept.getLast().toLowerCase())) {
            kept.removeLast();
        }
        if (kept.isEmpty()) {
            return "";
        }
        String name = String.join(" ", kept);
        name = Character.toUpperCase(name.charAt(0)) + name.substring(1);
        return name.length() <= MAX_NAME_LENGTH ? name : name.substring(0, MAX_NAME_LENGTH).strip();
    }
}
