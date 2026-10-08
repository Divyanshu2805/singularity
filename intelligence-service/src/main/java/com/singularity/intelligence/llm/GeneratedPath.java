package com.singularity.intelligence.llm;

import java.text.Normalizer;
import java.util.Optional;

/**
 * The canonical form of a file path the model wrote in a tag, or nothing when it is not a path a project may hold.
 *
 * <p>Handles: tidying the spellings a model uses for the same file - a leading {@code ./} or {@code /}, backslashes,
 * doubled slashes, a combining-character form of a precomposed name - into the one relative path workspace-service
 * stores, and rejecting anything that could never be stored: blank, over-long, absolute with a drive letter, a
 * directory rather than a file, containing a control or bidirectional-override character, or a {@code ..} segment.
 * A path holding any space other than the plain one - a no-break space, a line separator - is refused as well.
 *
 * <p>That last rule is what keeps three readers of one path in step. workspace-service strips a path with Java's
 * idea of whitespace, the browser's parser would strip it with JavaScript's, and the two differ on exactly those
 * characters, so a path ending in a no-break space was one file to the server and another to the page showing it.
 * Only the six plain spaces are trimmed here and the rest are refused, which leaves nothing for anyone else to strip.
 * Such a path is never one a model meant: the file it names cannot be imported by the name it appears to have.
 *
 * <p>It exists because a turn publishes as one atomic revision. workspace-service's own {@code ProjectFilePath} is
 * still the boundary that keeps a traversing path out of storage, but it rejects the whole revision when a single
 * path fails, so one file written as {@code ./src/App.tsx} used to lose every other file the turn wrote. Tidying here
 * first means only a genuinely unsafe path is dropped, and only that one.
 *
 * <p>The checklist ticks a step when its path equals a written file's path exactly, so both sides go through this
 * same function: {@code src/App.tsx} planned and {@code ./src/App.tsx} written are the same step.
 */
public final class GeneratedPath {

    static final int MAX_LENGTH = 400;

    private GeneratedPath() {
    }

    public static Optional<String> normalize(String raw) {
        if (GenerationProtocol.isBlank(raw)) {
            return Optional.empty();
        }
        String candidate = Normalizer.normalize(GenerationProtocol.trim(raw), Normalizer.Form.NFC).replace('\\', '/');
        if (candidate.length() >= 2 && candidate.charAt(1) == ':') {
            return Optional.empty();
        }
        if (candidate.codePoints().anyMatch(GeneratedPath::isDisallowed)) {
            return Optional.empty();
        }

        StringBuilder path = new StringBuilder();
        for (String segment : candidate.split("/")) {
            if (segment.isEmpty() || segment.equals(".")) {
                continue;
            }
            if (segment.equals("..")) {
                return Optional.empty();
            }
            if (!path.isEmpty()) {
                path.append('/');
            }
            path.append(segment);
        }
        if (path.isEmpty() || path.length() > MAX_LENGTH || candidate.endsWith("/")) {
            return Optional.empty();
        }
        return Optional.of(path.toString());
    }

    private static boolean isDisallowed(int codePoint) {
        if (codePoint < 0x20 || codePoint == 0x7f) {
            return true;
        }
        int type = Character.getType(codePoint);
        return type == Character.FORMAT
                || (codePoint != ' ' && (type == Character.SPACE_SEPARATOR
                        || type == Character.LINE_SEPARATOR
                        || type == Character.PARAGRAPH_SEPARATOR));
    }
}
