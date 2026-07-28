package com.vibecraft.intelligence.llm;

import com.vibecraft.intelligence.entity.ChatEvent;
import com.vibecraft.intelligence.entity.ChatMessage;
import com.vibecraft.intelligence.enums.ChatEventType;
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

/**
 * Turns a model's raw answer into the ordered events a turn is stored and rendered as.
 *
 * <p>Handles: recognising the tagged sections the generation prompt asks for - files to write, files to delete,
 * checklist items, teaching lessons and tool logs - and everything between them as plain message text, each assigned
 * its place in the turn.
 *
 * <p>It parses free text rather than a structured format, so it is tolerant by design: an unclosed or malformed tag
 * degrades to message text rather than losing the turn.
 */
@Component
@Slf4j
public class LlmResponseParser {

    private static final Pattern GENERIC_TAG_PATTERN = Pattern.compile(
            "(<(message|file|delete|tool|todo|learn)([^>]*)>)([\\s\\S]*?)(</\\2>)",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL
    );

    private static final Pattern ATTRIBUTE_PATTERN = Pattern.compile(
            "(path|args|concept)=\"([^\"]+)\""
    );

    private static final Pattern LESSON_PART_PATTERN = Pattern.compile("<part\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern LESSON_PART_CONCEPT_PATTERN = Pattern.compile(
            "<part\\b[^>]*?\\bconcept=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE);

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

            Map<String, String> attrMap = extractAttributes(attributes);

            ChatEvent.ChatEventBuilder builder = ChatEvent.builder()
                    .chatMessage(parentMessage)
                    .content(content)
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
                    builder.filePath(filePath);
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
                    builder.metadata(attrMap.get("args"));
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
                    builder.filePath(attrMap.get("path"));
                }
                case "learn" -> {
                    if (content.isBlank()) {
                        log.warn("Skipping <learn> tag with no text in AI response");
                        continue;
                    }
                    String filePath = attrMap.get("path");
                    if (filePath != null && !lessonPaths.add(filePath)) {
                        log.warn("Dropping a second <learn> for '{}' - only the first lesson per file is kept: {}",
                                filePath, preview(content));
                        continue;
                    }
                    builder.type(ChatEventType.LEARN);
                    builder.filePath(filePath);
                    builder.metadata(lessonConcepts(attrMap.get("concept"), content));
                }
                default -> { continue; }
            }

            events.add(builder.build());
        }

        logUnparsedGap(fullResponse, lastMatchEnd, fullResponse.length());

        return events;
    }

    public static int lessonPartCount(String lessonBody) {
        if (lessonBody == null) return 0;
        return (int) LESSON_PART_PATTERN.matcher(lessonBody).results().count();
    }

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
