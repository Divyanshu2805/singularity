package com.singularity.intelligence.llm;

import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * What a build turn is told about the conversation so far.
 *
 * <p>Handles: replaying the most recent exchanges within a fixed size; naming the files the last few turns touched,
 * which is where the next request most likely points; reducing an assistant turn to what it said,
 * what it decided, what it asked and which files it touched; shortening a long request; and keeping the exchange the
 * project was started from, however long ago that was, so the brief and the first design decisions are never lost.
 *
 * <p>The size is fixed so that the thirtieth turn of a conversation costs about what the third does. History used to
 * be bounded only by a count of turns, and a request can be sixteen thousand characters: ten of those, resent on
 * every call of every turn, cost more than the project's own files. The files are the real record of what earlier
 * turns did - the model is shown them in full - so an old exchange earns its place only for what the files cannot
 * say: what was asked, and why it was built the way it was.
 *
 * <p>That "why" is the model's own {@code <approach>} from the turn, a few lines of decisions with their reasons. It
 * is carried forward for the founding turn and the most recent ones, which is what stops a later turn from quietly
 * undoing an earlier choice - moving the data out of localStorage, swapping the palette - because nothing told it the
 * choice had been made on purpose. It belongs to one person's conversation, like the rest of the history, and never
 * crosses to another member's.
 *
 * <p>A question the assistant asked is always replayed with its turn: the person's next message is the answer, and
 * an answer with no question in front of it reads as a new request.
 */
public final class ConversationMemory {

    public record Turn(boolean fromUser, String said, List<String> decisions, List<String> asked, List<String> touched) {

        public static Turn request(String content) {
            return new Turn(true, content, List.of(), List.of(), List.of());
        }

        public static Turn reply(String said, List<String> decisions, List<String> asked, List<String> touched) {
            return new Turn(false, said, decisions, asked, touched);
        }
    }

    static final int MAX_EXCHANGES = 6;
    static final int MAX_CHARS = 12_000;
    static final int MAX_REQUEST_CHARS = 2_500;
    static final int MAX_SAID_CHARS = 800;
    static final int MAX_DECISION_CHARS = 600;
    static final int TURNS_WITH_DECISIONS = 3;

    private ConversationMemory() {
    }

    public static List<Message> replay(List<Turn> turns) {
        List<Turn> spoken = turns == null ? List.of() : turns.stream().filter(turn -> turn != null).toList();
        int from = windowStart(spoken);

        List<Message> recent = new ArrayList<>();
        int used = 0;
        int repliesSeen = 0;
        int first = spoken.size();
        for (int index = spoken.size() - 1; index >= from; index--) {
            Turn turn = spoken.get(index);
            boolean withDecisions = !turn.fromUser() && repliesSeen++ < TURNS_WITH_DECISIONS;
            String text = textOf(turn, withDecisions);
            if (text.isBlank()) {
                continue;
            }
            if (used + text.length() > MAX_CHARS && !recent.isEmpty()) {
                break;
            }
            used += text.length();
            recent.addFirst(turn.fromUser() ? new UserMessage(text) : new AssistantMessage(text));
            first = index;
        }

        List<Message> history = new ArrayList<>(founding(spoken, first));
        history.addAll(recent);
        return history;
    }

    public static Set<String> recentlyTouched(List<Turn> turns) {
        Set<String> touched = new LinkedHashSet<>();
        int replies = 0;
        for (int index = turns == null ? -1 : turns.size() - 1; index >= 0 && replies < TURNS_WITH_DECISIONS; index--) {
            Turn turn = turns.get(index);
            if (turn == null || turn.fromUser()) {
                continue;
            }
            replies++;
            if (turn.touched() != null) {
                touched.addAll(turn.touched());
            }
        }
        return touched;
    }

    private static int windowStart(List<Turn> turns) {
        int requests = 0;
        for (int index = turns.size() - 1; index >= 0; index--) {
            if (turns.get(index).fromUser() && ++requests == MAX_EXCHANGES) {
                return index;
            }
        }
        return 0;
    }

    private static List<Message> founding(List<Turn> turns, int firstReplayed) {
        int request = -1;
        for (int index = 0; index < firstReplayed; index++) {
            if (turns.get(index).fromUser() && !turns.get(index).said().isBlank()) {
                request = index;
                break;
            }
        }
        if (request < 0) {
            return List.of();
        }
        List<Message> founding = new ArrayList<>();
        founding.add(new UserMessage(textOf(turns.get(request), false)));

        StringBuilder reply = new StringBuilder();
        if (request + 1 < firstReplayed && !turns.get(request + 1).fromUser()) {
            reply.append(textOf(turns.get(request + 1), true));
        }
        long skipped = turns.subList(request + 1, firstReplayed).stream().filter(Turn::fromUser).count();
        if (skipped > 0) {
            reply.append(reply.isEmpty() ? "" : " ").append("(").append(skipped)
                    .append(skipped == 1 ? " later request is" : " later requests are")
                    .append(" not shown here; the project's files show what they changed.)");
        }
        if (!reply.isEmpty()) {
            founding.add(new AssistantMessage(reply.toString()));
        }
        return founding;
    }

    static String textOf(Turn turn, boolean withDecisions) {
        if (turn.fromUser()) {
            return shortened(turn.said() == null ? "" : turn.said().strip(), MAX_REQUEST_CHARS);
        }
        StringBuilder text = new StringBuilder(shortened(turn.said() == null ? "" : turn.said().strip(), MAX_SAID_CHARS));
        if (withDecisions && turn.decisions() != null && !turn.decisions().isEmpty()) {
            append(text, "(Decisions made in that turn: "
                    + shortened(String.join(" ", turn.decisions()).strip(), MAX_DECISION_CHARS) + ")");
        }
        if (turn.asked() != null && !turn.asked().isEmpty()) {
            append(text, "(You asked the user: " + String.join(" / ", turn.asked())
                    + " - their next message is the answer.)");
        }
        if (turn.touched() != null && !turn.touched().isEmpty()) {
            append(text, "(Files touched: " + String.join(", ", turn.touched()) + ")");
        }
        return text.toString();
    }

    private static void append(StringBuilder text, String part) {
        text.append(text.isEmpty() ? "" : " ").append(part);
    }

    private static String shortened(String text, int limit) {
        return text.length() <= limit ? text : text.substring(0, limit).stripTrailing() + " [...]";
    }
}
