package com.singularity.intelligence.llm;

import com.singularity.intelligence.entity.ChatEvent;
import com.singularity.intelligence.entity.ChatMessage;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.llm.GenerationProtocol.Block;
import com.singularity.intelligence.llm.GenerationProtocol.Dangling;
import com.singularity.intelligence.llm.GenerationProtocol.Scan;
import com.singularity.intelligence.llm.GenerationProtocol.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Turns a model's raw answer into the ordered events a turn is stored and rendered as.
 *
 * <p>Handles: giving each block {@link GenerationProtocol} found its meaning - a message, a file to write, a change
 * to part of a file, a file to delete, a checklist step, a teaching lesson, a read log, a question for the user with its suggested answers, the
 * model's own working-out - and applying the limits a turn is held to: twelve checklist steps, three questions with
 * up to six answers each, one lesson per file, and one change per path. It also reports what the text stopped inside of, and any path it had to
 * refuse, so the build pipeline can ask the model to carry on rather than save half an answer.
 *
 * <p>Only the last whole change to a path is kept - a file written or deleted - together with every change to part
 * of it that comes after. The prompt forbids writing a file twice in one reply, but a model does it anyway, and a
 * follow-up pass that repairs an import is allowed to; only the final version is ever saved, and an earlier one left
 * in the transcript would show a phantom extra write. Changes to part of a file are different: each builds on the
 * one before, so all of them since the file was last written whole are kept, in order.
 *
 * <p>A change to part of a file leaves here as its raw text ({@code FILE_PATCH}). Applying it needs the file it
 * changes, which this class has no way to read; the build pipeline does that ({@link FileEdits}) and nothing is
 * saved until it has.
 *
 * <p>A file's content keeps its own indentation and ends with exactly one line break. It used to be trimmed at both
 * ends, which saved every generated file without a final newline and stripped the indentation off a first line that
 * had any. A path is tidied to its stored form before anything compares it, because the checklist ticks a step by
 * exact equality with the path that was written. Only the six plain whitespace characters are ever trimmed, so the
 * browser's parser, which follows the same rules in another language, trims exactly the same ones.
 *
 * <p>Text between blocks is not an event. A model narrates before it reads files ("let me look at the hook"), and
 * that belongs in neither the transcript nor a file. How much was skipped is logged once per answer with a short
 * preview, since an unexpected amount of it is the first sign a model has stopped following the protocol. It is
 * handed back beside the events all the same, piece by piece with where each sat, and without the half-written block
 * the text may end in. The pipeline uses it in the two cases where dropping it would lose the answer: a model that
 * said everything in plain words, with no tags at all, and one that tagged its files and steps but wrote its plan and
 * its summary outside any {@code <message>}.
 */
@Component
@Slf4j
public class LlmResponseParser {

    public record ParsedEvent(ChatEventType type, String path, String content, String metadata, int start, int end) {

        public boolean isFileChange() {
            return type == ChatEventType.FILE_EDIT || type == ChatEventType.FILE_PATCH
                    || type == ChatEventType.FILE_DELETE;
        }

        public boolean replacesTheFile() {
            return type == ChatEventType.FILE_EDIT || type == ChatEventType.FILE_DELETE;
        }
    }

    public record CutOff(ChatEventType type, String path, int start, String partial) {
    }

    public record Loose(int start, int end, String text) {
    }

    public record ParsedTurn(String text, List<ParsedEvent> events, CutOff cutOff, List<String> rejectedPaths,
                             List<Loose> looseParts) {

        public boolean endsMidBlock() {
            return cutOff != null && events.stream().noneMatch(event -> event.start() > cutOff.start());
        }

        public String looseText() {
            return looseTextBetween(0, text.length());
        }

        public String looseTextBetween(int from, int to) {
            StringBuilder words = new StringBuilder();
            for (Loose part : looseParts) {
                if (part.start() < from || part.end() > to) {
                    continue;
                }
                if (!words.isEmpty()) {
                    words.append("\n\n");
                }
                words.append(part.text());
            }
            return words.toString();
        }
    }

    private static final Pattern LESSON_PART_PATTERN = Pattern.compile("<part\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern LESSON_PART_CONCEPT_PATTERN = Pattern.compile(
            "<part\\b[^>]*?\\bconcept=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE);
    private static final Pattern PLAIN_SPACE_RUN = Pattern.compile("[ \\t\\n\\r\\f\\x0B]+");

    static final int MAX_CHECKLIST_STEPS = 12;
    static final int MAX_QUESTIONS_PER_TURN = 3;
    static final int MAX_ANSWER_OPTIONS = 6;
    static final int MAX_ANSWER_OPTION_CHARS = 80;
    public static final String ANSWER_OPTION_SEPARATOR = "|";

    private static final char LINE_BREAK = '\n';

    public ParsedTurn parse(String fullResponse) {
        String text = fullResponse == null ? "" : fullResponse;
        Scan scan = GenerationProtocol.scan(text);

        List<ParsedEvent> events = new ArrayList<>();
        List<String> rejectedPaths = new ArrayList<>();
        Set<String> lessonPaths = new HashSet<>();
        int checklistSteps = 0;
        int questions = 0;

        for (Block block : scan.blocks()) {
            String body = GenerationProtocol.trim(block.body());
            String rawPath = block.attributes().get("path");
            Optional<String> path = GeneratedPath.normalize(rawPath);

            switch (block.tag()) {
                case MESSAGE -> {
                    if (!body.isEmpty()) {
                        events.add(event(ChatEventType.MESSAGE, null, body, null, block));
                    }
                }
                case FILE -> {
                    if (path.isEmpty()) {
                        rejectedPaths.add(rawPath);
                        continue;
                    }
                    events.add(event(ChatEventType.FILE_EDIT, path.get(), fileContent(block.body()), null, block));
                }
                case EDIT -> {
                    if (path.isEmpty()) {
                        rejectedPaths.add(rawPath);
                        continue;
                    }
                    events.add(event(ChatEventType.FILE_PATCH, path.get(), fileContent(block.body()), null, block));
                }
                case DELETE -> {
                    if (path.isEmpty()) {
                        rejectedPaths.add(rawPath);
                        continue;
                    }
                    events.add(event(ChatEventType.FILE_DELETE, path.get(), body, null, block));
                }
                case TOOL -> events.add(event(ChatEventType.TOOL_LOG, null, body, block.attributes().get("args"), block));
                case TODO -> {
                    if (body.isEmpty() || ++checklistSteps > MAX_CHECKLIST_STEPS) {
                        continue;
                    }
                    events.add(event(ChatEventType.TODO, path.orElse(null), body, null, block));
                }
                case LEARN -> {
                    if (body.isEmpty() || (path.isPresent() && !lessonPaths.add(path.get()))) {
                        continue;
                    }
                    events.add(event(ChatEventType.LEARN, path.orElse(null), body,
                            lessonConcepts(block.attributes().get("concept"), body), block));
                }
                case ASK -> {
                    if (body.isEmpty() || ++questions > MAX_QUESTIONS_PER_TURN) {
                        continue;
                    }
                    events.add(event(ChatEventType.ASK, null, body,
                            answerOptions(block.attributes().get("options")), block));
                }
                case APPROACH, THINK -> {
                    if (!body.isEmpty()) {
                        events.add(event(ChatEventType.THINKING, null, body, null, block));
                    }
                }
            }
        }

        List<Loose> looseParts = looseParts(text, scan.blocks(), scan.dangling());
        if (!looseParts.isEmpty()) {
            String first = looseParts.getFirst().text();
            log.info("Skipped {} character(s) of text outside the protocol's blocks, starting: {}",
                    looseParts.stream().mapToInt(part -> part.text().length()).sum(),
                    first.length() > 100 ? first.substring(0, 100) + "..." : first);
        }
        if (checklistSteps > MAX_CHECKLIST_STEPS) {
            log.warn("Dropped {} checklist step(s) over the {} step cap", checklistSteps - MAX_CHECKLIST_STEPS, MAX_CHECKLIST_STEPS);
        }
        if (!rejectedPaths.isEmpty()) {
            log.warn("Refused {} file change(s) whose path is not a plain relative project path", rejectedPaths.size());
        }
        return new ParsedTurn(text, keepCurrentChangesPerPath(events), cutOff(scan.dangling()), List.copyOf(rejectedPaths),
                looseParts);
    }

    public List<ChatEvent> toChatEvents(List<ParsedEvent> events, ChatMessage parentMessage) {
        List<ChatEvent> chatEvents = new ArrayList<>(events.size());
        int order = 1;
        for (ParsedEvent event : events) {
            chatEvents.add(ChatEvent.builder()
                    .chatMessage(parentMessage)
                    .type(event.type())
                    .content(event.content())
                    .filePath(event.path())
                    .metadata(event.metadata())
                    .sequenceOrder(order++)
                    .build());
        }
        return chatEvents;
    }

    public List<ChatEvent> parseChatEvents(String fullResponse, ChatMessage parentMessage) {
        return toChatEvents(parse(fullResponse).events(), parentMessage);
    }

    private static ParsedEvent event(ChatEventType type, String path, String content, String metadata, Block block) {
        return new ParsedEvent(type, path, content, metadata, block.start(), block.end());
    }

    private static CutOff cutOff(Dangling dangling) {
        if (dangling == null) {
            return null;
        }
        String path = GeneratedPath.normalize(dangling.attributes().get("path")).orElse(null);
        return new CutOff(typeOf(dangling.tag()), path, dangling.start(), dangling.body());
    }

    private static ChatEventType typeOf(Tag tag) {
        return switch (tag) {
            case MESSAGE -> ChatEventType.MESSAGE;
            case FILE -> ChatEventType.FILE_EDIT;
            case EDIT -> ChatEventType.FILE_PATCH;
            case DELETE -> ChatEventType.FILE_DELETE;
            case TOOL -> ChatEventType.TOOL_LOG;
            case TODO -> ChatEventType.TODO;
            case LEARN -> ChatEventType.LEARN;
            case ASK -> ChatEventType.ASK;
            case APPROACH, THINK -> ChatEventType.THINKING;
        };
    }

    static String fileContent(String body) {
        int firstContent = 0;
        while (firstContent < body.length() && GenerationProtocol.isSpace(body.charAt(firstContent))) {
            firstContent++;
        }
        if (firstContent == body.length()) {
            return "";
        }
        int lineStart = body.lastIndexOf(LINE_BREAK, firstContent - 1) + 1;
        int end = body.length();
        while (GenerationProtocol.isSpace(body.charAt(end - 1))) {
            end--;
        }
        return body.substring(lineStart, end) + LINE_BREAK;
    }

    private List<ParsedEvent> keepCurrentChangesPerPath(List<ParsedEvent> events) {
        Map<String, Integer> lastWholeChange = new LinkedHashMap<>();
        for (int index = 0; index < events.size(); index++) {
            if (events.get(index).replacesTheFile()) {
                lastWholeChange.put(events.get(index).path(), index);
            }
        }
        List<ParsedEvent> kept = new ArrayList<>(events.size());
        for (int index = 0; index < events.size(); index++) {
            ParsedEvent event = events.get(index);
            if (event.isFileChange() && index < lastWholeChange.getOrDefault(event.path(), -1)) {
                continue;
            }
            kept.add(event);
        }
        if (kept.size() < events.size()) {
            log.warn("Dropped {} change(s) to a path that the same answer went on to write or delete whole",
                    events.size() - kept.size());
        }
        return List.copyOf(kept);
    }

    static String answerOptions(String raw) {
        if (raw == null) return null;
        List<String> options = new ArrayList<>();
        for (String option : raw.split("\\|")) {
            String text = GenerationProtocol.trim(PLAIN_SPACE_RUN.matcher(option).replaceAll(" "));
            if (text.isEmpty() || options.contains(text)) continue;
            options.add(text.length() > MAX_ANSWER_OPTION_CHARS
                    ? GenerationProtocol.trim(text.substring(0, MAX_ANSWER_OPTION_CHARS)) : text);
            if (options.size() == MAX_ANSWER_OPTIONS) break;
        }
        return options.isEmpty() ? null : String.join(ANSWER_OPTION_SEPARATOR, options);
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
        String name = GenerationProtocol.trim(PLAIN_SPACE_RUN.matcher(concept.replace(',', ' ')).replaceAll(" "));
        if (!name.isEmpty()) concepts.putIfAbsent(name.toLowerCase(Locale.ROOT), name);
    }

    private static List<Loose> looseParts(String text, List<Block> blocks, Dangling dangling) {
        List<Loose> loose = new ArrayList<>();
        int from = 0;
        for (int index = 0; index <= blocks.size(); index++) {
            int to = index < blocks.size() ? blocks.get(index).start() : text.length();
            if (dangling != null && dangling.start() >= from && dangling.start() < to) {
                to = dangling.start();
            }
            String gap = GenerationProtocol.trim(text.substring(from, Math.max(from, to)));
            if (!gap.isEmpty()) {
                loose.add(new Loose(from, Math.max(from, to), gap));
            }
            if (index < blocks.size()) {
                from = blocks.get(index).end();
            }
        }
        return List.copyOf(loose);
    }
}
