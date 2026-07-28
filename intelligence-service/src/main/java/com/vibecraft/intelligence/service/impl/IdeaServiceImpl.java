package com.vibecraft.intelligence.service.impl;

import com.vibecraft.intelligence.dto.idea.ClarifyIdeaRequest;
import com.vibecraft.intelligence.dto.idea.ClarifyIdeaResponse;
import com.vibecraft.intelligence.dto.idea.ClarifyingQuestion;
import com.vibecraft.intelligence.dto.idea.CompileIdeaRequest;
import com.vibecraft.intelligence.dto.idea.CompileIdeaResponse;
import com.vibecraft.intelligence.dto.idea.IdeaAnswer;
import com.vibecraft.intelligence.llm.AiUsageRecorder;
import com.vibecraft.intelligence.service.IdeaService;
import com.vibecraft.intelligence.service.UsageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.converter.BeanOutputConverter;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * The pre-project idea interview and the brief compiled from it.
 *
 * <p>Handles: asking the model for a few tailored questions about an idea, validating and bounding what comes back
 * (question and helper length, option counts, the fixed question ids), turning the answers into a brief, and billing
 * both calls to the caller's usage.
 *
 * <p>Every AI step has a non-AI fallback, so a model hiccup never blocks creating a project: the interview falls back
 * to a fixed set of questions and the brief to the user's own words.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IdeaServiceImpl implements IdeaService {

    private static final int MAX_IDEA_CHARS = 1500;
    private static final int MAX_QUESTION_CHARS = 120;
    private static final int MAX_HELPER_CHARS = 160;
    private static final int MAX_OPTIONS = 6;
    private static final int MIN_OPTIONS = 2;
    private static final int MAX_OPTION_CHARS = 60;
    private static final int MAX_SPEC_CHARS = 3500;

    private static final int MAX_QUESTIONS = 4;
    private static final int MID_QUESTIONS = 3;
    private static final int MIN_QUESTIONS = 2;
    private static final int BRIEF_IDEA_WORDS = 10;
    private static final int DETAILED_IDEA_WORDS = 30;
    private static final Pattern SPECIFICITY_MARKER = Pattern.compile(
            "[,;:\\n\\-*]|\\b(?:with|for|that|so|where|plus|including|like)\\b", Pattern.CASE_INSENSITIVE);
    private static final int RICH_DETAIL_MARKERS = 3;

    private static final List<ClarifyingQuestion> FALLBACK_QUESTIONS = List.of(
            new ClarifyingQuestion(
                    "audience",
                    "Who is this for?",
                    "Knowing your users shapes every screen.",
                    List.of("Just me", "My customers", "My team at work", "Students or learners", "The general public"),
                    false),
            new ClarifyingQuestion(
                    "core_action",
                    "What's the one thing people must be able to do?",
                    "Everything else gets built around this.",
                    List.of("Create and manage items", "Browse and search content", "Track progress over time",
                            "Book or buy something", "Share with others"),
                    false),
            new ClarifyingQuestion(
                    "content",
                    "What will it hold?",
                    "The main things people will see and add.",
                    List.of("Notes or text", "Tasks or to-dos", "Photos or files", "Events or dates",
                            "Products", "People or contacts"),
                    true),
            new ClarifyingQuestion(
                    "screens",
                    "Which screens does it need?",
                    "Pick any that apply. You can always add more later.",
                    List.of("Landing page", "Dashboard", "List or feed", "Detail page", "Settings", "Sign in"),
                    true),
            new ClarifyingQuestion(
                    "scope",
                    "What can the first version skip?",
                    "Leaving things out now means a better first version, sooner.",
                    List.of("Accounts and sign-in", "Payments", "Notifications", "Search",
                            "Sharing or collaboration", "Mobile layout"),
                    true),
            new ClarifyingQuestion(
                    "style",
                    "What should it feel like?",
                    "A style reference helps the design land the first time.",
                    List.of("Clean and minimal", "Bold and colorful", "Dark and techy", "Playful and friendly",
                            "Like Notion", "Like Stripe"),
                    false)
    );

    private static final int MAX_ID_CHARS = 50;
    private static final Pattern NON_SLUG = Pattern.compile("[^a-z0-9]+");

    private static final String CLARIFY_SYSTEM_PROMPT_TEMPLATE = """
            You run a short interview about an app someone wants built, before any code is written.

            Write exactly %d question(s), invented for THIS idea specifically. Do not work from a standard
            checklist - a good question asks about a decision this particular app genuinely needs made, in the
            vocabulary of what it actually is. A booking site raises questions a note-taking app never would.
            If a question you are about to write is already answered by their description, throw it away and
            ask about something they have not settled yet.

            The last question must be about the look and feel - the visual direction, or a style reference.
            That is the one thing almost no description settles, and it decides whether the first version lands.

            Give each question:
            - id: a short snake_case label for what it asks about, such as "seat_limits" or "visual_style".
                  Unique within your reply.
            - question: under 12 words, plain language, no jargon, answerable by someone non-technical.
            - helper: one friendly sentence on why it matters for what they are building.
            - options: 4 to 6 concrete answers, 2 to 6 words each, specific enough that someone who has not
                  thought about this yet would recognise one as what they meant.
            - multiSelect: true when several options can sensibly apply together, false when it is one choice.

            Never ask about technology, frameworks, budgets, or deadlines, and never ask two questions about
            the same decision.
            """;

    private static final String COMPILE_SYSTEM_PROMPT = """
            You turn an app idea and the answers from a short interview into a clear, concise brief that an AI app
            builder will follow to build the first version. Reply with plain markdown in exactly this shape and
            nothing else - no preamble, no closing remarks:
            **Build:** one sentence describing the app.
            **For:** who it's for.
            **Core action:** the single most important user flow, in one or two sentences.
            **Screens:**
            - one bullet per screen: its name, then what it shows and lets people do.
            **Style:** the visual direction with concrete cues (colors, typography feel, density).
            **Keep it simple:**
            - two or three bullets of things to leave out of the first version.
            Stay faithful to the answers. The interview is deliberately short and won't have covered every
            section above - where it didn't, or where a question was skipped, infer a sensible choice from the
            idea itself rather than leaving the section out.
            Keep the whole brief under 220 words.
            """;

    private static final BeanOutputConverter<ClarifyIdeaResponse> QUESTIONS_CONVERTER =
            new BeanOutputConverter<>(ClarifyIdeaResponse.class);

    private final ChatClient chatClient;
    private final AiUsageRecorder aiUsageRecorder;
    private final UsageService usageService;

    @Override
    public ClarifyIdeaResponse clarify(ClarifyIdeaRequest request) {
        usageService.assertWithinDailyTokenBudget();
        String idea = truncate(request.idea().strip(), MAX_IDEA_CHARS);
        int budget = questionBudget(idea);
        log.debug("Asking {} clarifying question(s) for an idea of {} words", budget, wordCount(idea));
        try {
            ChatResponse response = chatClient.prompt()
                    .system(CLARIFY_SYSTEM_PROMPT_TEMPLATE.formatted(budget) + "\n\n" + QUESTIONS_CONVERTER.getFormat())
                    .user(idea)
                    .call()
                    .chatResponse();
            aiUsageRecorder.record(response, com.vibecraft.intelligence.enums.UsageFeature.IDEA_INTERVIEW, null);
            return new ClarifyIdeaResponse(sanitizeQuestions(QUESTIONS_CONVERTER.convert(responseText(response)), budget));
        } catch (Exception e) {
            log.warn("AI idea clarification failed, falling back to untailored questions", e);
            return new ClarifyIdeaResponse(sanitizeQuestions(null, budget));
        }
    }

    private static int questionBudget(String idea) {
        int words = wordCount(idea);
        long markers = SPECIFICITY_MARKER.matcher(idea).results().count();

        if (words <= BRIEF_IDEA_WORDS && markers <= 1) {
            return MAX_QUESTIONS;
        }
        if (words >= DETAILED_IDEA_WORDS && markers >= RICH_DETAIL_MARKERS) {
            return MIN_QUESTIONS;
        }
        return MID_QUESTIONS;
    }

    @Override
    public CompileIdeaResponse compile(CompileIdeaRequest request) {
        usageService.assertWithinDailyTokenBudget();
        String idea = truncate(request.idea().strip(), MAX_IDEA_CHARS);
        List<IdeaAnswer> answered = request.answers().stream()
                .filter(answer -> !cleanAnswers(answer.answers()).isEmpty())
                .toList();

        String interview = answered.isEmpty()
                ? "(Every question was skipped.)"
                : answered.stream()
                        .map(answer -> "- " + answer.question().strip() + " " + String.join(", ", cleanAnswers(answer.answers())))
                        .collect(Collectors.joining("\n"));

        try {
            ChatResponse response = chatClient.prompt()
                    .system(COMPILE_SYSTEM_PROMPT)
                    .user("Idea: " + idea + "\n\nInterview answers:\n" + interview)
                    .call()
                    .chatResponse();
            aiUsageRecorder.record(response, com.vibecraft.intelligence.enums.UsageFeature.IDEA_INTERVIEW, null);
            String spec = responseText(response);
            if (spec != null && !spec.isBlank()) {
                return new CompileIdeaResponse(truncate(spec.strip(), MAX_SPEC_CHARS));
            }
            log.warn("AI returned an empty project brief, falling back to a template brief");
        } catch (Exception e) {
            log.warn("AI brief compilation failed, falling back to a template brief", e);
        }
        return new CompileIdeaResponse(templateSpec(idea, answered));
    }

    List<ClarifyingQuestion> sanitizeQuestions(ClarifyIdeaResponse generated, int budget) {
        if (generated == null || generated.questions() == null) {
            return fallbackQuestions(budget);
        }

        Set<String> usedIds = new LinkedHashSet<>();
        List<ClarifyingQuestion> cleaned = new ArrayList<>();
        for (ClarifyingQuestion candidate : generated.questions()) {
            if (cleaned.size() >= budget) {
                break;
            }
            ClarifyingQuestion question = cleanQuestion(candidate, usedIds);
            if (question != null) {
                cleaned.add(question);
            }
        }

        if (cleaned.isEmpty()) {
            log.warn("The model returned no usable clarifying questions, falling back to generic ones");
            return fallbackQuestions(budget);
        }
        return List.copyOf(cleaned);
    }

    private ClarifyingQuestion cleanQuestion(ClarifyingQuestion candidate, Set<String> usedIds) {
        if (candidate == null || isBlank(candidate.question())) {
            return null;
        }
        List<String> options = candidate.options() == null ? List.of() : candidate.options().stream()
                .filter(option -> !isBlank(option))
                .map(option -> truncate(option.strip().replaceAll("[.]+$", ""), MAX_OPTION_CHARS))
                .distinct()
                .limit(MAX_OPTIONS)
                .toList();
        if (options.size() < MIN_OPTIONS) {
            return null;
        }

        String question = truncate(candidate.question().strip(), MAX_QUESTION_CHARS);
        String id = uniqueId(candidate.id(), question, usedIds);
        usedIds.add(id);

        return new ClarifyingQuestion(
                id,
                question,
                isBlank(candidate.helper()) ? null : truncate(candidate.helper().strip(), MAX_HELPER_CHARS),
                options,
                candidate.multiSelect());
    }

    private static String uniqueId(String proposed, String question, Set<String> usedIds) {
        String base = slug(isBlank(proposed) ? question : proposed);
        if (base.isEmpty()) {
            base = "question";
        }
        String id = base;
        for (int suffix = 2; usedIds.contains(id); suffix++) {
            String tail = "_" + suffix;
            id = truncate(base, MAX_ID_CHARS - tail.length()) + tail;
        }
        return id;
    }

    private static int wordCount(String text) {
        return (int) Arrays.stream(text.split("\\s+")).filter(word -> !word.isBlank()).count();
    }

    private static String slug(String text) {
        String slug = NON_SLUG.matcher(text.strip().toLowerCase()).replaceAll("_").replaceAll("^_+|_+$", "");
        return truncate(slug, MAX_ID_CHARS);
    }

    private static List<ClarifyingQuestion> fallbackQuestions(int budget) {
        List<ClarifyingQuestion> others = FALLBACK_QUESTIONS.subList(0, FALLBACK_QUESTIONS.size() - 1);
        List<ClarifyingQuestion> chosen =
                new ArrayList<>(others.subList(0, Math.min(others.size(), Math.max(budget - 1, 0))));
        chosen.add(FALLBACK_QUESTIONS.getLast());
        return List.copyOf(chosen);
    }

    private String templateSpec(String idea, List<IdeaAnswer> answers) {
        StringBuilder spec = new StringBuilder("**Build:** ").append(idea);
        if (!answers.isEmpty()) {
            spec.append("\n\n**Details:**");
            for (IdeaAnswer answer : answers) {
                List<String> values = cleanAnswers(answer.answers());
                if (values.isEmpty()) {
                    continue;
                }
                spec.append("\n- ").append(stripTrailing(answer.question().strip()))
                        .append(": ").append(String.join(", ", values));
            }
        }
        return truncate(spec.toString(), MAX_SPEC_CHARS);
    }

    private static String stripTrailing(String question) {
        return question.replaceAll("[?:\\s]+$", "");
    }

    private static List<String> cleanAnswers(List<String> answers) {
        return answers == null ? List.of() : answers.stream()
                .filter(answer -> !isBlank(answer))
                .map(String::strip)
                .toList();
    }

    private static String responseText(ChatResponse response) {
        return response == null || response.getResult() == null ? null : response.getResult().getOutput().getText();
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String truncate(String value, int maxChars) {
        return value.length() <= maxChars ? value : value.substring(0, maxChars).strip();
    }
}
