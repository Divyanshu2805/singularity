package com.singularity.intelligence.llm;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The grammar of a build turn's raw text: where each tagged block starts and ends, and nothing about what it means.
 *
 * <p>Handles: finding every opening tag the protocol defines, deciding where each block's body ends, and reporting
 * the one block the text stops inside of, if any. {@code frontend/src/lib/generation-protocol.ts} implements the same
 * rules for the text while it is still arriving, and both are run against the cases in
 * {@code src/test/resources/protocol/cases.json}, so the two cannot drift apart unnoticed.
 *
 * <p>The rules, which are the whole contract:
 * <ul>
 * <li>A tag name is exactly one of message, file, edit, delete, tool, todo, learn, ask, approach, think, in lower
 * case, followed by nothing but well-formed {@code name="value"} attributes. A {@code file}, {@code edit} or
 * {@code delete} is only a tag when it carries a non-blank {@code path}.</li>
 * <li>A file's body is opaque, and so is an edit's: both hold code. It ends at the first closing tag of its own
 * name that is either the last one before the next {@code <file path=...>} or {@code <edit path=...>} opens, or is
 * followed by another opening tag before the next such closing tag. Nothing inside it is read as a tag.</li>
 * <li>Every other block ends at the last matching closing tag before the next opening tag.</li>
 * <li>A block that never closes is not a block. If nothing could still close it - no later opening tag for an
 * ordinary block, no later file or edit for either of those - it is reported as the one the text is dangling
 * inside.</li>
 * <li>Space means the six plain characters - space, tab, line feed, carriage return, form feed, vertical tab - and
 * nothing else, wherever a rule here or in the classes built on it says blank or trimmed. Java and JavaScript each
 * have a wider idea of whitespace and the two do not agree, so neither is used.</li>
 * </ul>
 *
 * <p>Names used to be matched without regard to case, and a file's body was searched for opening tags like any other
 * text. Together those read {@code useState<Todo[]>} as the start of a checklist step in the middle of a file: the
 * file then had no closing tag before "the next tag", so it was discarded whole, and a generated todo app lost its
 * hook file on every attempt while the browser, parsing more leniently, showed it as written. Any project with a type
 * or component named Todo, Message, File, Tool, Ask, Learn or Delete was affected. An opaque body and exact lower-case
 * names are what closed that.
 *
 * <p>The file rule keeps a literal {@code </file>} inside a file's own content from ending it early, which the
 * earlier fix for that case achieved by bounding the search at any opening tag - the bound that made the bug above
 * possible. What remains ambiguous is a file whose content holds both a literal {@code </file>} and, after it, a
 * literal opening tag; no parser can tell that from two blocks without the model escaping its output.
 *
 * <p>{@code approach} is the model's working-out before it answers, shown to the user as a thought process they can
 * open. It is an ordinary block like a message. {@code think} means the same and is read the same way, but the model
 * is never asked for it: that name belongs to the reasoning some models and gateways handle themselves, and a real
 * model asked for a {@code <think>} block followed every other line of the format and left that one out. It stays in
 * the grammar for the models that write one unprompted, whose reasoning used to land between blocks and be dropped.
 *
 * <p>{@code edit} changes part of a file that already exists: its body is one or more pieces of the file as it
 * stands, each followed by what replaces it ({@link FileEdits} reads and applies them). It was added because a model
 * asked for a small change wrote every file it touched out again in full, and in a long file a line would come back
 * damaged - a different line each time, so asking it to fix the file broke it somewhere else. This class only finds
 * the block; what is inside is code, which is why it is opaque exactly as a file is.
 */
public final class GenerationProtocol {

    public enum Tag {
        MESSAGE, FILE, EDIT, DELETE, TOOL, TODO, LEARN, ASK, APPROACH, THINK;

        boolean isOpaque() {
            return this == FILE || this == EDIT;
        }

        String closing() {
            return "</" + name().toLowerCase(Locale.ROOT) + ">";
        }

        static Tag of(String name) {
            return valueOf(name.toUpperCase(Locale.ROOT));
        }
    }

    public record Block(Tag tag, Map<String, String> attributes, String body, int start, int end) {
    }

    public record Dangling(Tag tag, Map<String, String> attributes, String body, int start) {
    }

    public record Scan(List<Block> blocks, Dangling dangling) {
    }

    private record Open(Tag tag, Map<String, String> attributes, int start, int end) {
    }

    private static final String SPACE = "[ \\t\\r\\n]";
    private static final String ATTRIBUTE = SPACE + "+[A-Za-z][\\w-]*" + SPACE + "*=" + SPACE + "*(?:\"[^\"]*\"|'[^']*')";

    private static final Pattern OPEN_TAG = Pattern.compile(
            "<(message|file|edit|delete|tool|todo|learn|ask|approach|think)((?:" + ATTRIBUTE + ")*)" + SPACE + "*>");
    private static final Pattern ATTRIBUTE_PAIR = Pattern.compile(
            "([A-Za-z][\\w-]*)" + SPACE + "*=" + SPACE + "*(?:\"([^\"]*)\"|'([^']*)')");

    private static final String PLAIN_SPACES = " \t\n\r\f\u000B";

    private GenerationProtocol() {
    }

    static boolean isSpace(char character) {
        return PLAIN_SPACES.indexOf(character) >= 0;
    }

    static String trim(String text) {
        int start = 0;
        int end = text.length();
        while (start < end && isSpace(text.charAt(start))) {
            start++;
        }
        while (end > start && isSpace(text.charAt(end - 1))) {
            end--;
        }
        return text.substring(start, end);
    }

    static boolean isBlank(String value) {
        return value == null || trim(value).isEmpty();
    }

    public static Scan scan(String text) {
        List<Open> opens = findOpens(text);
        List<Block> blocks = new ArrayList<>();
        Dangling dangling = null;
        int cursor = 0;

        for (int index = 0; index < opens.size(); index++) {
            Open open = opens.get(index);
            if (open.start() < cursor) {
                continue;
            }
            int close = open.tag().isOpaque() ? opaqueClose(text, opens, index) : plainClose(text, opens, index);
            if (close < 0) {
                if (dangling == null && isUnbounded(opens, index)) {
                    dangling = new Dangling(open.tag(), open.attributes(), text.substring(open.end()), open.start());
                }
                continue;
            }
            int end = close + open.tag().closing().length();
            blocks.add(new Block(open.tag(), open.attributes(), text.substring(open.end(), close), open.start(), end));
            cursor = end;
        }
        return new Scan(blocks, dangling);
    }

    private static List<Open> findOpens(String text) {
        List<Open> opens = new ArrayList<>();
        Matcher matcher = OPEN_TAG.matcher(text);
        while (matcher.find()) {
            Tag tag = Tag.of(matcher.group(1));
            Map<String, String> attributes = attributes(matcher.group(2));
            if ((tag.isOpaque() || tag == Tag.DELETE) && isBlank(attributes.get("path"))) {
                continue;
            }
            opens.add(new Open(tag, attributes, matcher.start(), matcher.end()));
        }
        return opens;
    }

    private static Map<String, String> attributes(String raw) {
        Map<String, String> attributes = new LinkedHashMap<>();
        Matcher matcher = ATTRIBUTE_PAIR.matcher(raw);
        while (matcher.find()) {
            attributes.put(matcher.group(1), matcher.group(2) != null ? matcher.group(2) : matcher.group(3));
        }
        return attributes;
    }

    private static boolean isUnbounded(List<Open> opens, int index) {
        if (!opens.get(index).tag().isOpaque()) {
            return index == opens.size() - 1;
        }
        return nextOpaqueStart(opens, index) < 0;
    }

    private static int nextOpaqueStart(List<Open> opens, int index) {
        for (int next = index + 1; next < opens.size(); next++) {
            if (opens.get(next).tag().isOpaque()) {
                return opens.get(next).start();
            }
        }
        return -1;
    }

    private static int plainClose(String text, List<Open> opens, int index) {
        Open open = opens.get(index);
        String closing = open.tag().closing();
        int bound = index + 1 < opens.size() ? opens.get(index + 1).start() : text.length();
        int close = text.lastIndexOf(closing, bound - closing.length());
        return close >= open.end() ? close : -1;
    }

    private static int opaqueClose(String text, List<Open> opens, int index) {
        Open open = opens.get(index);
        String closing = open.tag().closing();
        int nextOpaque = nextOpaqueStart(opens, index);
        int bound = nextOpaque < 0 ? text.length() : nextOpaque;

        List<Integer> candidates = new ArrayList<>();
        for (int at = text.indexOf(closing, open.end()); at >= 0 && at + closing.length() <= bound;
             at = text.indexOf(closing, at + closing.length())) {
            candidates.add(at);
        }
        for (int candidate = 0; candidate < candidates.size() - 1; candidate++) {
            int gapStart = candidates.get(candidate) + closing.length();
            int gapEnd = candidates.get(candidate + 1);
            if (hasOpenBetween(opens, index, gapStart, gapEnd)) {
                return candidates.get(candidate);
            }
        }
        return candidates.isEmpty() ? -1 : candidates.getLast();
    }

    private static boolean hasOpenBetween(List<Open> opens, int after, int from, int to) {
        for (int next = after + 1; next < opens.size(); next++) {
            int start = opens.get(next).start();
            if (start >= to) {
                return false;
            }
            if (start >= from) {
                return true;
            }
        }
        return false;
    }
}
