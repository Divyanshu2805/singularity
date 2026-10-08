package com.singularity.intelligence.llm;

import com.singularity.intelligence.llm.LlmResponseParser.ParsedTurn;
import com.singularity.intelligence.llm.ProjectImports.Kind;
import com.singularity.intelligence.llm.ProjectImports.Problem;
import com.singularity.intelligence.llm.TurnReview.Review;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the decision a build turn makes after every model call: finished, worth continuing, or empty - and the words
 * sent to the model when it has to carry on.
 *
 * <p>Two mistakes are pinned from both sides. Stopping one file short of the plan must be noticed, since that is how a
 * generated app ended up importing a hook that was never written. And reading files and then answering in words must
 * not be, since treating it as an abandoned edit made every question about a project run twice.
 */
class TurnReviewTest {

    private final LlmResponseParser parser = new LlmResponseParser();

    private Review review(String answer, boolean endedNormally) {
        return TurnReview.of(parser.parse(answer), endedNormally);
    }

    private static final String PLAN = """
            <message>I'll build the todo app.</message>
            <todo path="src/types/todo.ts">Defining the todo type</todo>
            <todo path="src/hooks/useTodos.ts">Building the todo state hook</todo>
            """;

    @Test
    void anAnswerThatWroteEverythingItPlannedIsComplete() {
        Review review = review(PLAN + """
                <file path="src/types/todo.ts">export type Todo = { id: string };</file>
                <file path="src/hooks/useTodos.ts">export const useTodos = () => [];</file>
                <message>Done.</message>
                """, true);

        assertThat(review.kind()).isEqualTo(TurnReview.Kind.COMPLETE);
        assertThat(review.missing()).isEmpty();
        assertThat(review.written()).containsExactly("src/types/todo.ts", "src/hooks/useTodos.ts");
    }

    @Test
    void anAnswerThatStoppedOneFileShortOfItsPlanIsContinuedFromBeforeItsPrematureDone() {
        String answer = PLAN + "<file path=\"src/types/todo.ts\">export type Todo = { id: string };</file>"
                + "<message>Done. The app is ready.</message>";

        Review review = review(answer, true);

        assertThat(review.kind()).isEqualTo(TurnReview.Kind.CONTINUE);
        assertThat(review.missing()).containsExactly("src/hooks/useTodos.ts");
        assertThat(answer.substring(0, review.keepUntil())).endsWith("</file>").doesNotContain("Done. The app is ready.");
        assertThat(review.instruction())
                .contains("do NOT output these again").contains("- src/types/todo.ts")
                .contains("Still to write").contains("- src/hooks/useTodos.ts");
        assertThat(review.statusLine()).isEqualTo("The reply stopped early - writing the 1 file still left");
    }

    @Test
    void anAnswerCutOffInsideAFileKeepsEverythingBeforeThatFileAndAsksForItAgainInFull() {
        String answer = PLAN + "<file path=\"src/types/todo.ts\">export type Todo = { id: string };</file>"
                + "<file path=\"src/hooks/useTodos.ts\">export function useTodos() {\n  const [todos";

        Review review = review(answer, false);

        assertThat(review.kind()).isEqualTo(TurnReview.Kind.CONTINUE);
        assertThat(review.cutOffPath()).isEqualTo("src/hooks/useTodos.ts");
        assertThat(review.missing()).containsExactly("src/hooks/useTodos.ts");
        assertThat(answer.substring(0, review.keepUntil())).endsWith("export type Todo = { id: string };</file>");
        assertThat(review.instruction()).contains("was cut off part-way and discarded - write it again in full");
    }

    @Test
    void aFileCutOffThatWasNeverInThePlanIsStillOwed() {
        Review review = review("<message>Adding a helper.</message><file path=\"src/lib/format.ts\">export const f", false);

        assertThat(review.kind()).isEqualTo(TurnReview.Kind.CONTINUE);
        assertThat(review.missing()).containsExactly("src/lib/format.ts");
    }

    @Test
    void stepsWithNoFilesAtAllAreAnUnfinishedAnswer() {
        Review review = review("<message>Plan.</message><todo>Building the page</todo><message>All set.</message>", true);

        assertThat(review.kind()).isEqualTo(TurnReview.Kind.CONTINUE);
        assertThat(review.instruction()).contains("You listed the steps but wrote no files");
    }

    @Test
    void readingFilesAndAnsweringInWordsIsACompleteAnswerNotAnAbandonedEdit() {
        Review review = review(
                "<tool args=\"src/App.tsx\">Reading 1 file</tool><message>Routing is set up in App.tsx with two routes.</message>",
                true);

        assertThat(review.kind()).isEqualTo(TurnReview.Kind.COMPLETE);
    }

    @Test
    void anAnswerThatAsksTheUserIsCompleteEvenThoughItWroteNothing() {
        Review review = review(
                "<message>One thing first.</message><ask options=\"A table|Cards\">How should orders be shown?</ask>", true);

        assertThat(review.kind()).isEqualTo(TurnReview.Kind.COMPLETE);
    }

    @Test
    void anAnswerThatBuiltAPartAndThenAskedIsCompleteAndKeepsWhatItWrote() {
        Review review = review("""
                <todo path="src/types/todo.ts">Defining the todo type</todo>
                <file path="src/types/todo.ts">export type Todo = { id: string };</file>
                <message>The type is in. One thing before the list.</message>
                <ask options="A table|Cards">How should todos be shown?</ask>
                """, true);

        assertThat(review.kind()).isEqualTo(TurnReview.Kind.COMPLETE);
        assertThat(review.written()).containsExactly("src/types/todo.ts");
    }

    @Test
    void anAnswerThatOnlyThoughtIsEmptyHoweverMuchItThought() {
        String thought = "<think>One page, no router. Tasks go in localStorage.</think>";

        assertThat(review(thought, true).kind()).isEqualTo(TurnReview.Kind.EMPTY);
        assertThat(review("<tool args=\"src/App.tsx\">Reading 1 file</tool>" + thought, true).kind())
                .isEqualTo(TurnReview.Kind.EMPTY);
        assertThat(review(thought + "<message>Starting with the list.</message>", true).kind())
                .isEqualTo(TurnReview.Kind.COMPLETE);
        assertThat(TurnReview.answerReminder()).contains("Do not think it through again").contains("<file path=");
    }

    @Test
    void aReplyCutOffInsideAFileKeepsTheLessonWrittenBeforeThatFile() {
        String kept = PLAN + "<learn path=\"src/types/todo.ts\"><what>What a todo is.</what><why>Everything uses it.</why></learn>";

        Review review = review(kept + "<file path=\"src/types/todo.ts\">export type Todo = {", false);

        assertThat(review.kind()).isEqualTo(TurnReview.Kind.CONTINUE);
        assertThat(review.keepUntil()).isEqualTo(kept.length());
        assertThat(review.instruction()).contains("each with its <learn> first").contains("Do not write another <approach>");
    }

    @Test
    void theNoteOnATurnThatRanOutOfAllowanceSaysWhatWasSavedAndWhenItCanCarryOn() {
        String finishedOne = PLAN + "<file path=\"src/types/todo.ts\">export type Todo = { id: string };</file>";

        assertThat(review(finishedOne + "<file path=\"src/hooks/useTodos.ts\">export const", false).outOfBudgetNotice())
                .contains("ran out part-way through").contains("1 of 2 steps were finished and saved")
                .contains("preview may show errors").contains("refills at midnight").contains("Use Retry then");
        assertThat(review(PLAN, false).outOfBudgetNotice())
                .contains("before any file was finished, so nothing was changed").doesNotContain("Retry");
        assertThat(review(finishedOne + "<file path=\"src/hooks/useTodos.ts\">export const a = 1;</file><message>Do", false)
                .outOfBudgetNotice()).contains("as this was finishing").contains("were saved");
        assertThat(review("<file path=\"a.ts\">export const a = 1;</file><file path=\"b.ts\">export", false).outOfBudgetNotice())
                .contains("1 file was finished and saved");
    }

    @Test
    void aCallThatDidNotEndCleanlyIsContinuedWithoutThrowingAwayWhatItSaid() {
        String answer = "<tool args=\"src/App.tsx\">Reading 1 file</tool><message>Routing is set up in App.tsx.</message>";

        Review review = review(answer, false);

        assertThat(review.kind()).isEqualTo(TurnReview.Kind.CONTINUE);
        assertThat(review.keepUntil()).isEqualTo(answer.length());
        assertThat(review.instruction()).contains("cut off before it finished");
        assertThat(review.statusLine()).isEqualTo("The reply stopped early - carrying on");
    }

    @Test
    void anAnswerWithNothingUsableIsEmpty() {
        assertThat(review("", true).kind()).isEqualTo(TurnReview.Kind.EMPTY);
        assertThat(review("Let me think about this for a moment.", true).kind()).isEqualTo(TurnReview.Kind.EMPTY);
        assertThat(review("<file path=\"a.ts\">cut off before anything finished", false).kind()).isEqualTo(TurnReview.Kind.EMPTY);
    }

    @Test
    void anAnswerHoldingNothingButTheServersNoteThatFilesWereReadIsEmpty() {
        String readNote = "<tool args=\"src/App.tsx\">Reading 1 file</tool>";

        assertThat(review(readNote, true).kind()).isEqualTo(TurnReview.Kind.EMPTY);
        assertThat(review(readNote + "Routing is in App.tsx.", true).kind()).isEqualTo(TurnReview.Kind.EMPTY);
    }

    @Test
    void aReplyThatEndedNormallyInsideItsOnlyMessageHasAnsweredAndIsNotAskedAgain() {
        String answer = "<tool args=\"src/App.tsx\">Reading 1 file</tool><message>Routing is set up in App.tsx.";

        Review review = review(answer, true);

        assertThat(review.kind()).isEqualTo(TurnReview.Kind.COMPLETE);
        assertThat(review.keepUntil()).isEqualTo(answer.length());
        assertThat(review("<message>Just this.", true).kind()).isEqualTo(TurnReview.Kind.COMPLETE);
    }

    @Test
    void theSameReplyCutOffThereOrLeftWithAnEmptyMessageIsStillEmpty() {
        assertThat(review("<message>Routing is set up in", false).kind()).isEqualTo(TurnReview.Kind.EMPTY);
        assertThat(review("<message>  \n", true).kind()).isEqualTo(TurnReview.Kind.EMPTY);
    }

    @Test
    void theNoteOnATurnThatStillEndsUnfinishedSaysHowFarItGot() {
        ParsedTurn turn = parser.parse(PLAN + "<file path=\"src/types/todo.ts\">export type Todo = {};</file>");

        assertThat(TurnReview.of(turn, true).unfinishedNotice())
                .isEqualTo("This answer stopped before it finished. 1 of 2 steps are done; the rest weren't written. "
                        + "Use Retry to carry on from here.");
    }

    @Test
    void theRepairRequestNamesEachImportThatDoesNotResolve() {
        String instruction = TurnReview.repairInstruction(List.of(), List.of(), List.of(
                new Problem("src/pages/Index.tsx", "../hooks/useTodos", Kind.MISSING_FILE),
                new Problem("src/App.tsx", "framer-motion", Kind.MISSING_PACKAGE)));

        assertThat(instruction)
                .contains("`src/pages/Index.tsx` imports \"../hooks/useTodos\", but no such file exists")
                .contains("`src/App.tsx` imports \"framer-motion\", but that package is not listed in package.json")
                .contains("You may change again a file you already wrote or edited")
                .doesNotContain("Edits that could not be applied").doesNotContain("Files that do not parse");
    }

    @Test
    void theRepairRequestSaysAFailedEditWasNotMadeAndQuotesWhatWasLookedFor() {
        String instruction = TurnReview.repairInstruction(
                List.of(new FileEdits.Problem("src/App.tsx", FileEdits.NOT_FOUND, "  const heading = 1;\n")),
                List.of(new SyntaxCheck.Problem("src/lib/total.ts", 2, 19, "Unexpected token.", "> 2 |   const sum = a + ;\n")),
                List.of());

        assertThat(instruction)
                .contains("these changes were NOT made")
                .contains("src/App.tsx: the SEARCH text is not in the file. The SEARCH text began:\n  const heading = 1;")
                .contains("src/lib/total.ts line 2: Unexpected token.\n> 2 |   const sum = a + ;")
                .contains("Output ONLY the <edit> and <file> tags that are needed")
                .doesNotContain("Imports that cannot be resolved");
    }

    @Test
    void theNotesOnAnEditThatWasNeverAppliedAndOnAFileThatDoesNotParseSayWhatToDo() {
        assertThat(TurnReview.unappliedNotice(List.of(
                new FileEdits.Problem("src/a.ts", FileEdits.NOT_FOUND, null),
                new FileEdits.Problem("src/b.ts", FileEdits.NOT_FOUND, null))))
                .isEqualTo("I couldn't apply my change to src/a.ts, src/b.ts, so those files were left as they were. "
                        + "Ask me to make that change again.");
        assertThat(TurnReview.syntaxNotice(List.of(
                new SyntaxCheck.Problem("src/lib/total.ts", 2, 19, "Unexpected token.", ""))))
                .isEqualTo("Heads up: src/lib/total.ts has a syntax error on line 2 - Unexpected token. The preview "
                        + "will show an error until that is fixed - ask me to fix it.");
    }

    @Test
    void aReplyCutOffInsideAnEditOwesThatFile() {
        ParsedTurn turn = parser.parse("<message>On it.</message><todo path=\"src/a.ts\">Changing it</todo>"
                + "<edit path=\"src/a.ts\">\n<<<<<<< SEARCH\nconst a = 1;\n=======\nconst");

        assertThat(TurnReview.of(turn, false).missing()).containsExactly("src/a.ts");
        assertThat(TurnReview.of(turn, false).cutOffPath()).isEqualTo("src/a.ts");
    }

    @Test
    void theNoteOnAnImportThatStayedBrokenTellsTheUserWhatToExpect() {
        String notice = TurnReview.unresolvedNotice(List.of(
                new Problem("src/pages/Index.tsx", "../hooks/useTodos", Kind.MISSING_FILE),
                new Problem("src/App.tsx", "framer-motion", Kind.MISSING_PACKAGE)));

        assertThat(notice).startsWith("Heads up: `src/pages/Index.tsx` imports \"../hooks/useTodos\"")
                .contains("(and 1 more like it)").contains("ask me to fix it");
    }
}
