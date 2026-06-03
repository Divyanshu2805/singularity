package com.java.vibecraft.llm;

import com.java.vibecraft.entity.ChatEvent;
import com.java.vibecraft.entity.ChatMessage;
import com.java.vibecraft.enums.ChatEventType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@Slf4j
public class LlmResponseParser {

    /**
     * Regex Breakdown:
     * Group 1: Opening Tag (<tag ...>)
     * Group 2: Tag Name (message|file|tool|todo)
     * Group 3: Attributes part (e.g., ' path="foo"' or ' args="a,b"')
     * Group 4: Content (The stuff inside)
     * Group 5: Closing Tag (</tag>)
     */

    private static final Pattern GENERIC_TAG_PATTERN = Pattern.compile(
            "(<(message|file|tool|todo)([^>]*)>)([\\s\\S]*?)(</\\2>)",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL
    );

    // Helper to extract specific attributes (path="..." or args="...") from Group 3
    private static final Pattern ATTRIBUTE_PATTERN = Pattern.compile(
            "(path|args)=\"([^\"]+)\""
    );

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
                default -> { continue; }
            }

            events.add(builder.build());
        }

        logUnparsedGap(fullResponse, lastMatchEnd, fullResponse.length());

        return events;
    }

    private void logUnparsedGap(String fullResponse, int from, int to) {
        String gap = fullResponse.substring(from, to).trim();
        if (!gap.isEmpty()) {
            log.warn("Ignoring {} character(s) of unrecognized content in AI response (model may not be " +
                    "following the expected <message>/<todo>/<file>/<tool> protocol): {}", gap.length(), preview(gap));
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
