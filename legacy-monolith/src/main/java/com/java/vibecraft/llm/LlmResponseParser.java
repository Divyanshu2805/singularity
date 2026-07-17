package com.java.vibecraft.llm;

import com.java.vibecraft.entity.ChatEvent;
import com.java.vibecraft.entity.ChatMessage;
import com.java.vibecraft.enums.ChatEventType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@Slf4j
public class LlmResponseParser {

    /**
     * Regex Breakdown:
     * Group 1: Opening Tag (<tag ...>)
     * Group 2: Tag Name (message|file|delete|tool|todo|learn)
     * Group 3: Attributes part (e.g., ' path="foo"', ' args="a,b"' or ' concept="Props"')
     * Group 4: Content (The stuff inside)
     * Group 5: Closing Tag (</tag>)
     */

    private static final Pattern GENERIC_TAG_PATTERN = Pattern.compile(
            "(<(message|file|delete|tool|todo|learn)([^>]*)>)([\\s\\S]*?)(</\\2>)",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL
    );

    // Helper to extract specific attributes (path="...", args="..." or concept="...") from Group 3
    private static final Pattern ATTRIBUTE_PATTERN = Pattern.compile(
            "(path|args|concept)=\"([^\"]+)\""
    );

    // A teaching-mode walkthrough's parts, and the concept each one introduces (both inside a <learn> body).
    private static final Pattern LESSON_PART_PATTERN = Pattern.compile("<part\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern LESSON_PART_CONCEPT_PATTERN = Pattern.compile(
            "<part\\b[^>]*?\\bconcept=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE);

    /**
     * A backstop on runaway checklists, not a target. The prompt ties the step count to the files actually
     * being written, so the real length is set by the work; this only exists so a model that ignores that
     * can't persist dozens of rows or turn the progress card back into the wall of text it replaced.
     *
     * <p>Deliberately NOT capped at the number of {@code <file>} tags in the response: a checklist longer
     * than the files delivered means the model announced steps it never did, and leaving those visible
     * (unticked) is the point - truncating them would hide an unfinished plan.
     */
    private static final int MAX_CHECKLIST_STEPS = 12;

    public List<ChatEvent> parseChatEvents(String fullResponse, ChatMessage parentMessage) {
        List<ChatEvent> events = new ArrayList<>();
        int orderCounter = 1;
        int lastMatchEnd = 0;
        int checklistSteps = 0;
        Set<String> lessonPaths = new HashSet<>();

        Matcher matcher = GENERIC_TAG_PATTERN.matcher(fullResponse);

        while (matcher.find()) {
            logUnparsedGap(fullResponse, lastMatchEnd, matcher.start());
            lastMatchEnd = matcher.end();

            String tagName = matcher.group(2).toLowerCase();
            String attributes = matcher.group(3);
            String content = matcher.group(4).trim();

            // Extract attributes map
            Map<String, String> attrMap = extractAttributes(attributes);

            ChatEvent.ChatEventBuilder builder = ChatEvent.builder()
                    .chatMessage(parentMessage)
                    .content(content) // This is your Markdown content
                    .sequenceOrder(orderCounter++);

            switch (tagName) {
                case "message" -> builder.type(ChatEventType.MESSAGE);
                case "file" -> {
                    String filePath = attrMap.get("path");
                    if (filePath == null || filePath.isBlank()) {
                        log.warn("Skipping <file> tag with no 'path' attribute in AI response: {}", preview(content));
                        continue;
                    }
                    builder.type(ChatEventType.FILE_EDIT);
                    builder.filePath(filePath); // Required for files
                }
                case "delete" -> {
                    String filePath = attrMap.get("path");
                    if (filePath == null || filePath.isBlank()) {
                        log.warn("Skipping <delete> tag with no 'path' attribute in AI response: {}", preview(content));
                        continue;
                    }
                    builder.type(ChatEventType.FILE_DELETE);
                    builder.filePath(filePath);
                }
                case "tool" -> {
                    builder.type(ChatEventType.TOOL_LOG);
                    builder.metadata(attrMap.get("args")); // Store raw file list in metadata
                }
                case "todo" -> {
                    if (content.isBlank()) {
                        log.warn("Skipping <todo> tag with no text in AI response");
                        continue;
                    }
                    if (++checklistSteps > MAX_CHECKLIST_STEPS) {
                        log.warn("Dropping checklist step {} - the model emitted more than the {} step cap: {}",
                                checklistSteps, MAX_CHECKLIST_STEPS, preview(content));
                        continue;
                    }
                    builder.type(ChatEventType.TODO);
                    // Optional: a step that names the file it will write gets ticked off when that
                    // file's FILE_EDIT lands. A step without one (e.g. "Wire up the routes") is
                    // tracked by position instead - see the client's checklist rendering.
                    builder.filePath(attrMap.get("path"));
                }
                case "learn" -> {
                    if (content.isBlank()) {
                        log.warn("Skipping <learn> tag with no text in AI response");
                        continue;
                    }
                    String filePath = attrMap.get("path");
                    // One lesson per file, mirroring the one-<file>-per-path rule. The client drops the same
                    // repeat while streaming, so what's shown live matches what's saved here.
                    if (filePath != null && !lessonPaths.add(filePath)) {
                        log.warn("Dropping a second <learn> for '{}' - only the first lesson per file is kept: {}",
                                filePath, preview(content));
                        continue;
                    }
                    builder.type(ChatEventType.LEARN);
                    // The body is saved as written - its summary and parts are laid out by the
                    // client - and the path is how the client puts the walkthrough under its file's row.
                    builder.filePath(filePath);
                    // The concepts it introduces are what later requests read back, so the model can use those
                    // names without explaining them to this learner again.
                    builder.metadata(lessonConcepts(attrMap.get("concept"), content));
                }
                default -> { continue; }
            }

            events.add(builder.build());
        }

        logUnparsedGap(fullResponse, lastMatchEnd, fullResponse.length());

        return events;
    }

    /** How many code parts a walkthrough explains - logged per turn to see whether lessons cover their files. */
    public static int lessonPartCount(String lessonBody) {
        if (lessonBody == null) return 0;
        return (int) LESSON_PART_PATTERN.matcher(lessonBody).results().count();
    }

    /**
     * Every concept a walkthrough's parts introduce, comma-joined in the order they appear, or null for none. Commas
     * inside a name are dropped so the joined list splits back cleanly. {@code tagConcept} is the single
     * {@code concept} attribute lessons carried on the {@code <learn>} tag itself before walkthroughs existed.
     */
    static String lessonConcepts(String tagConcept, String lessonBody) {
        Map<String, String> concepts = new LinkedHashMap<>();
        addConcept(concepts, tagConcept);
        LESSON_PART_CONCEPT_PATTERN.matcher(lessonBody).results().forEach(match -> addConcept(concepts, match.group(1)));
        return concepts.isEmpty() ? null : String.join(", ", concepts.values());
    }

    private static void addConcept(Map<String, String> concepts, String concept) {
        if (concept == null) return;
        String name = concept.replace(',', ' ').replaceAll("\\s+", " ").strip();
        if (!name.isEmpty()) concepts.putIfAbsent(name.toLowerCase(Locale.ROOT), name);
    }

    private void logUnparsedGap(String fullResponse, int from, int to) {
        String gap = fullResponse.substring(from, to).trim();
        if (!gap.isEmpty()) {
            log.warn("Ignoring {} character(s) of unrecognized content in AI response (model may not be " +
                    "following the expected <message>/<todo>/<file>/<delete>/<learn>/<tool> protocol): {}", gap.length(), preview(gap));
        }
    }

    private String preview(String text) {
        return text.length() > 100 ? text.substring(0, 100) + "..." : text;
    }

    private Map<String, String> extractAttributes(String attributeString) {
        Map<String, String> attributes = new HashMap<>();
        if (attributeString == null) return attributes;

        Matcher matcher = ATTRIBUTE_PATTERN.matcher(attributeString);
        while (matcher.find()) {
            attributes.put(matcher.group(1), matcher.group(2));
        }
        return attributes;
    }

}
