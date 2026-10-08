package com.singularity.intelligence.llm;

import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.llm.LlmResponseParser.ParsedEvent;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * Turns a model's changes to part of a file into the whole files they produce.
 *
 * <p>Handles: reading the pieces an {@code <edit>} holds - each a run of the file's own lines under
 * {@code <<<<<<< SEARCH}, then {@code =======}, then what replaces them, closed by {@code >>>>>>> REPLACE}; finding
 * each run in the file; putting the replacement in its place; and, across a whole answer, leaving every changed path
 * as one written file, with a reason for each path whose change could not be applied.
 *
 * <p>It exists because of what whole files cost. Asked to add a dark theme, a model wrote nine files out again in
 * full and two of the longest came back with a stray backslash at the end of one line. Asked to fix those, it wrote
 * both out again, mended the lines it was shown and damaged three others. The longer the file a model has to repeat,
 * the more often a line of it comes back wrong; a change that names only the lines it touches cannot damage the rest.
 *
 * <p>A run of lines must be found in exactly one place. It is looked for three ways, strictest first: as written;
 * ignoring spaces at the ends of lines; ignoring indentation as well. The first way that finds it anywhere decides -
 * one place is the answer, more than one is refused as ambiguous rather than guessed at. A model copies code from
 * what it was shown and gets the words right far more reliably than the spaces around them, which is why the looser
 * ways exist; when only the loosest matches and the file's lines are all indented further by the same amount, the
 * replacement is indented to match.
 *
 * <p>Three allowances came from the first real turn that used this, none of which a made-up test had thought of.
 * The model had read the files through its tool, which then handed them over as JSON, and it copied a run of lines
 * as it had seen them: on one line, with {@code \n} written out between them. So a run that is not found is looked
 * for once more with those escapes turned back into what they stand for. Asked to repair one edit, it sent every
 * edit again, including one that had already been applied - whose text to look for was therefore gone, which failed
 * it and, by the rule below, took the applied change down with it. So a run that is not found, but whose replacement
 * is already in the file in exactly one place, is taken as done. That is only believed of a replacement long enough
 * to be recognisable; a lone closing brace is in every file. And a refusal now says where the copy went wrong - which
 * line of the run differs and what the file has there - because "not found" alone gave the model nothing to correct.
 *
 * <p>A path's changes land together or not at all. If any piece of any edit to a path cannot be applied, every
 * change to part of that path in the answer is dropped and the path goes back to what it was - the file as the same
 * answer wrote it whole, if it did, and otherwise untouched. Half of a change is how a file ends up with a function
 * called that was never added.
 *
 * <p>Changes build on each other in the order they were written: an edit applies to the file as the answer has left
 * it so far - written whole earlier in the same answer, or already edited - and only otherwise to the stored file.
 * An edit to a file the answer deleted, or to one that does not exist, is refused; a new file is written whole.
 *
 * <p>The file is handed out as one event where the last change to it stood, so the checklist ticks its step when the
 * last of its edits has arrived and not before.
 */
public final class FileEdits {

    public record Hunk(String search, String replace) {
    }

    public record Problem(String path, String reason, String search) {

        public String describe() {
            String quoted = search == null || search.isBlank() ? "" : " The SEARCH text began:\n" + search;
            return path + ": " + reason + "." + quoted;
        }
    }

    public record Resolved(List<ParsedEvent> events, List<Problem> problems, List<ParsedEvent> unapplied) {

        public boolean isClean() {
            return problems.isEmpty();
        }
    }

    record Applied(String content, String reason, String search) {

        boolean failed() {
            return reason != null;
        }
    }

    private static final class PathState {
        private String content;
        private ParsedEvent anchor;
        private ParsedEvent whole;
        private boolean deleted;
        private boolean failed;
        private final List<ParsedEvent> patches = new ArrayList<>();
    }

    private static final Pattern SEARCH_MARK = Pattern.compile("^[ \\t]*<{5,9}[ \\t]*SEARCH[ \\t]*$");
    private static final Pattern DIVIDER = Pattern.compile("^[ \\t]*={5,9}[ \\t]*$");
    private static final Pattern REPLACE_MARK = Pattern.compile("^[ \\t]*>{5,9}[ \\t]*REPLACE[ \\t]*$");

    private static final int QUOTED_SEARCH_LINES = 4;
    private static final int QUOTED_SEARCH_CHARS = 320;
    private static final int RECOGNISABLE_REPLACEMENT_CHARS = 40;
    private static final int SHOWN_BEFORE_DIFFERENCE = 40;
    private static final int SHOWN_AFTER_DIFFERENCE = 60;

    static final String NOT_AN_EDIT = "the edit holds no SEARCH/REPLACE block";
    static final String UNCLOSED = "a SEARCH/REPLACE block was not closed with >>>>>>> REPLACE";
    static final String EMPTY_SEARCH = "a SEARCH block is empty - it must hold the lines being replaced";
    static final String NOT_FOUND = "the SEARCH text is not in the file";
    static final String MISSING_FILE = "this file does not exist, so there is nothing to edit - write it whole with <file>";
    static final String DELETED_FILE = "this file was deleted earlier in the same reply";

    private FileEdits() {
    }

    public static Resolved resolve(List<ParsedEvent> events, Function<String, Optional<String>> stored) {
        Map<String, PathState> states = new LinkedHashMap<>();
        Map<String, Optional<String>> read = new HashMap<>();
        List<Problem> problems = new ArrayList<>();
        List<ParsedEvent> unapplied = new ArrayList<>();

        for (ParsedEvent event : events) {
            if (!event.isFileChange()) {
                continue;
            }
            PathState state = states.computeIfAbsent(event.path(), path -> new PathState());
            switch (event.type()) {
                case FILE_EDIT -> {
                    state.content = event.content();
                    state.anchor = event;
                    state.whole = event;
                    state.deleted = false;
                    state.failed = false;
                    state.patches.clear();
                }
                case FILE_DELETE -> {
                    state.content = null;
                    state.anchor = event;
                    state.whole = event;
                    state.deleted = true;
                    state.failed = false;
                    state.patches.clear();
                }
                default -> {
                    state.patches.add(event);
                    if (state.failed) {
                        unapplied.add(event);
                        continue;
                    }
                    Applied applied = applyTo(state, event, stored, read);
                    if (applied.failed()) {
                        problems.add(new Problem(event.path(), applied.reason(), applied.search()));
                        unapplied.addAll(state.patches);
                        state.failed = true;
                        state.anchor = state.whole;
                        state.content = state.whole == null || state.deleted ? null : state.whole.content();
                    } else {
                        state.content = applied.content();
                        state.anchor = event;
                    }
                }
            }
        }

        Map<ParsedEvent, String> written = new IdentityHashMap<>();
        states.forEach((path, state) -> {
            if (state.anchor != null && !state.deleted) {
                written.put(state.anchor, state.content);
            } else if (state.anchor != null) {
                written.put(state.anchor, null);
            }
        });

        List<ParsedEvent> resolved = new ArrayList<>(events.size());
        for (ParsedEvent event : events) {
            if (!event.isFileChange()) {
                resolved.add(event);
            } else if (written.containsKey(event)) {
                String content = written.get(event);
                resolved.add(event.type() == ChatEventType.FILE_DELETE
                        ? event
                        : new ParsedEvent(ChatEventType.FILE_EDIT, event.path(), content, null, event.start(), event.end()));
            }
        }
        return new Resolved(List.copyOf(resolved), List.copyOf(problems), List.copyOf(unapplied));
    }

    private static Applied applyTo(PathState state, ParsedEvent patch, Function<String, Optional<String>> stored,
                                   Map<String, Optional<String>> read) {
        if (state.deleted) {
            return new Applied(null, DELETED_FILE, null);
        }
        String base = state.content;
        if (base == null) {
            base = read.computeIfAbsent(patch.path(), stored).orElse(null);
        }
        if (base == null) {
            return new Applied(null, MISSING_FILE, null);
        }
        return apply(base, patch.content());
    }

    static Applied apply(String content, String patch) {
        List<Hunk> hunks = new ArrayList<>();
        String malformed = readHunks(patch, hunks);
        if (malformed != null) {
            return new Applied(null, malformed, null);
        }

        boolean windowsLines = content.contains("\r\n");
        boolean endsWithLineBreak = content.endsWith("\n");
        List<String> lines = new ArrayList<>(List.of(content.replace("\r\n", "\n").split("\n", -1)));
        if (endsWithLineBreak) {
            lines.removeLast();
        }

        for (Hunk hunk : hunks) {
            List<String> search = withoutBlankEnds(linesOf(hunk.search()));
            if (search.isEmpty()) {
                return new Applied(null, EMPTY_SEARCH, null);
            }
            String failure = replaceOnce(lines, search, linesOf(hunk.replace()));
            if (failure != null) {
                return new Applied(null, failure, quoted(search));
            }
        }

        String joined = String.join(windowsLines ? "\r\n" : "\n", lines);
        return new Applied(joined.isEmpty() ? "" : joined + (windowsLines ? "\r\n" : "\n"), null, null);
    }

    static String readHunks(String patch, List<Hunk> hunks) {
        StringBuilder search = null;
        StringBuilder replace = null;
        for (String line : linesOf(patch)) {
            if (search == null) {
                if (SEARCH_MARK.matcher(line).matches()) {
                    search = new StringBuilder();
                }
            } else if (replace == null) {
                if (DIVIDER.matcher(line).matches()) {
                    replace = new StringBuilder();
                } else {
                    search.append(line).append('\n');
                }
            } else if (REPLACE_MARK.matcher(line).matches()) {
                hunks.add(new Hunk(search.toString(), replace.toString()));
                search = null;
                replace = null;
            } else {
                replace.append(line).append('\n');
            }
        }
        if (search != null) {
            return UNCLOSED;
        }
        return hunks.isEmpty() ? NOT_AN_EDIT : null;
    }

    private static String replaceOnce(List<String> lines, List<String> search, List<String> replacement) {
        String refusal = replaceWhereFound(lines, search, replacement);
        if (refusal == null || !refusal.equals(NOT_FOUND)) {
            return refusal;
        }
        List<String> unescaped = unescaped(search);
        if (!unescaped.equals(search) && !unescaped.isEmpty()) {
            String second = replaceWhereFound(lines, unescaped, replacement);
            if (second == null || !second.equals(NOT_FOUND)) {
                return second;
            }
        }
        if (isAlreadyThere(lines, replacement)) {
            return null;
        }
        return NOT_FOUND + nearestMiss(lines, search);
    }

    private static String replaceWhereFound(List<String> lines, List<String> search, List<String> replacement) {
        for (int looseness = 0; looseness < 3; looseness++) {
            List<Integer> found = find(lines, search, looseness);
            if (found.size() > 1) {
                return "the SEARCH text matches " + found.size() + " places in the file - include more of the lines "
                        + "around it so that it matches only one";
            }
            if (found.size() == 1) {
                int at = found.getFirst();
                List<String> fitted = looseness == 2 ? reindented(lines, at, search, replacement) : replacement;
                for (int removed = 0; removed < search.size(); removed++) {
                    lines.remove(at);
                }
                lines.addAll(at, fitted);
                return null;
            }
        }
        return NOT_FOUND;
    }

    private static List<String> unescaped(List<String> search) {
        String joined = String.join("\n", search);
        if (!joined.contains("\\n") && !joined.contains("\\\"")) {
            return search;
        }
        return withoutBlankEnds(linesOf(joined.replace("\\n", "\n").replace("\\t", "\t").replace("\\\"", "\"")));
    }

    private static boolean isAlreadyThere(List<String> lines, List<String> replacement) {
        List<String> wanted = withoutBlankEnds(replacement);
        int characters = wanted.stream().mapToInt(line -> loosened(line, 2).length()).sum();
        return characters >= RECOGNISABLE_REPLACEMENT_CHARS && find(lines, wanted, 1).size() == 1;
    }

    private static String nearestMiss(List<String> lines, List<String> search) {
        int bestStart = -1;
        int bestRun = 0;
        for (int start = 0; start < lines.size(); start++) {
            int run = 0;
            while (run < search.size() && start + run < lines.size()
                    && loosened(lines.get(start + run), 2).equals(loosened(search.get(run), 2))) {
                run++;
            }
            if (run > bestRun) {
                bestRun = run;
                bestStart = start;
            }
        }
        if (bestStart < 0 || bestRun == search.size()) {
            return " - its first line is nowhere in the file";
        }
        String wanted = loosened(search.get(bestRun), 2);
        String actual = bestStart + bestRun < lines.size() ? loosened(lines.get(bestStart + bestRun), 2) : "";
        int differsAt = 0;
        while (differsAt < wanted.length() && differsAt < actual.length() && wanted.charAt(differsAt) == actual.charAt(differsAt)) {
            differsAt++;
        }
        return " - line " + (bestRun + 1) + " of it reads `" + around(wanted, differsAt) + "` but the file, at its line "
                + (bestStart + bestRun + 1) + ", has `" + around(actual, differsAt) + "`";
    }

    private static String around(String line, int differsAt) {
        int from = Math.max(0, differsAt - SHOWN_BEFORE_DIFFERENCE);
        int to = Math.min(line.length(), differsAt + SHOWN_AFTER_DIFFERENCE);
        return (from > 0 ? "..." : "") + line.substring(from, to) + (to < line.length() ? "..." : "");
    }

    private static List<Integer> find(List<String> lines, List<String> search, int looseness) {
        List<Integer> found = new ArrayList<>();
        for (int start = 0; start + search.size() <= lines.size(); start++) {
            boolean matches = true;
            for (int offset = 0; offset < search.size() && matches; offset++) {
                matches = loosened(lines.get(start + offset), looseness).equals(loosened(search.get(offset), looseness));
            }
            if (matches) {
                found.add(start);
            }
        }
        return found;
    }

    private static String loosened(String line, int looseness) {
        if (looseness == 0) {
            return line;
        }
        int end = line.length();
        while (end > 0 && isIndent(line.charAt(end - 1))) {
            end--;
        }
        int start = looseness == 2 ? indentOf(line).length() : 0;
        return start >= end ? "" : line.substring(start, end);
    }

    private static List<String> reindented(List<String> lines, int at, List<String> search, List<String> replacement) {
        String added = null;
        for (int offset = 0; offset < search.size(); offset++) {
            String wanted = search.get(offset);
            if (loosened(wanted, 2).isEmpty()) {
                continue;
            }
            String inFile = indentOf(lines.get(at + offset));
            String inSearch = indentOf(wanted);
            if (!inFile.endsWith(inSearch)) {
                return replacement;
            }
            String extra = inFile.substring(0, inFile.length() - inSearch.length());
            if (added != null && !added.equals(extra)) {
                return replacement;
            }
            added = extra;
        }
        if (added == null || added.isEmpty()) {
            return replacement;
        }
        List<String> fitted = new ArrayList<>(replacement.size());
        for (String line : replacement) {
            fitted.add(loosened(line, 2).isEmpty() ? line : added + line);
        }
        return fitted;
    }

    private static String indentOf(String line) {
        int end = 0;
        while (end < line.length() && isIndent(line.charAt(end))) {
            end++;
        }
        return line.substring(0, end);
    }

    private static boolean isIndent(char character) {
        return character == ' ' || character == '\t';
    }

    private static List<String> linesOf(String text) {
        if (text == null || text.isEmpty()) {
            return List.of();
        }
        String plain = text.replace("\r\n", "\n");
        List<String> lines = new ArrayList<>(List.of(plain.split("\n", -1)));
        if (plain.endsWith("\n")) {
            lines.removeLast();
        }
        return lines;
    }

    private static List<String> withoutBlankEnds(List<String> lines) {
        int from = 0;
        int to = lines.size();
        while (from < to && loosened(lines.get(from), 2).isEmpty()) {
            from++;
        }
        while (to > from && loosened(lines.get(to - 1), 2).isEmpty()) {
            to--;
        }
        return lines.subList(from, to);
    }

    private static String quoted(List<String> search) {
        StringBuilder text = new StringBuilder();
        for (int line = 0; line < search.size() && line < QUOTED_SEARCH_LINES; line++) {
            text.append(search.get(line)).append('\n');
        }
        return text.length() > QUOTED_SEARCH_CHARS ? text.substring(0, QUOTED_SEARCH_CHARS) + "...\n" : text.toString();
    }
}
