package com.singularity.intelligence.llm;

import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.llm.FileEdits.Applied;
import com.singularity.intelligence.llm.FileEdits.Resolved;
import com.singularity.intelligence.llm.LlmResponseParser.ParsedEvent;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers applying a model's changes to part of a file, and leaving each changed path as one whole file.
 *
 * <p>The first case is the turn this exists for: one line of a long page changed, and every other line - the ones a
 * rewrite used to damage - byte for byte what it was. The rest are the ways a model's copy of the file differs from
 * the file (spaces at line ends, indentation, Windows line endings), the edits that must be refused rather than
 * guessed at (text that is not there, text that is there twice, a file that does not exist), and how several changes
 * to one path in one answer combine or fall together.
 */
class FileEditsTest {

    private static final String PAGE = """
            import { useState } from "react";

            export function Inquire() {
              const [formData, setFormData] = useState<InquiryData>({
                fullName: '',
                phone: '',
              });
              const [isSubmitted, setIsSubmitted] = useState(false);

              return (
                <div className="page">
                  {isSubmitted ? (
                    <p>Thanks.</p>
                  ) : (
                    <form />
                  )}
                </div>
              );
            }
            """;

    private static String block(String search, String replace) {
        return "<<<<<<< SEARCH\n" + search + "=======\n" + replace + ">>>>>>> REPLACE\n";
    }

    private static ParsedEvent patch(String path, String body) {
        return new ParsedEvent(ChatEventType.FILE_PATCH, path, body, null, 0, 0);
    }

    private static ParsedEvent file(String path, String content) {
        return new ParsedEvent(ChatEventType.FILE_EDIT, path, content, null, 0, 0);
    }

    private static Resolved resolve(Map<String, String> stored, ParsedEvent... events) {
        return FileEdits.resolve(List.of(events), path -> Optional.ofNullable(stored.get(path)));
    }

    @Test
    void oneLineOfALongFileChangesAndEveryOtherLineIsLeftExactlyAsItWas() {
        Applied applied = FileEdits.apply(PAGE, block(
                "    <div className=\"page\">\n", "    <div className=\"page dark:bg-neutral-950\">\n"));

        assertThat(applied.failed()).isFalse();
        assertThat(applied.content()).isEqualTo(PAGE.replace("className=\"page\"", "className=\"page dark:bg-neutral-950\""));
    }

    @Test
    void severalBlocksInOneEditAreAppliedInOrderEachToTheResultOfTheLast() {
        Applied applied = FileEdits.apply(PAGE, block("    fullName: '',\n", "    fullName: '',\n    email: '',\n")
                + block("    email: '',\n    phone: '',\n", "    email: '',\n"));

        assertThat(applied.content()).contains("    fullName: '',\n    email: '',\n  });").doesNotContain("phone");
    }

    @Test
    void anEmptyReplacementRemovesTheLines() {
        Applied applied = FileEdits.apply(PAGE, block("    phone: '',\n", ""));

        assertThat(applied.content()).isEqualTo(PAGE.replace("    phone: '',\n", ""));
    }

    @Test
    void spacesAtTheEndsOfLinesDoNotStopTheTextBeingFound() {
        Applied applied = FileEdits.apply(PAGE, block("    fullName: '',   \n", "    fullName: 'Ada',\n"));

        assertThat(applied.content()).contains("    fullName: 'Ada',\n");
    }

    @Test
    void textCopiedWithLessIndentationIsFoundAndItsReplacementIsIndentedToMatchTheFile() {
        Applied applied = FileEdits.apply(PAGE, block(
                "{isSubmitted ? (\n  <p>Thanks.</p>\n", "{isSubmitted ? (\n  <p>Thank you.</p>\n  <a href=\"/\">Home</a>\n"));

        assertThat(applied.content()).contains(
                "      {isSubmitted ? (\n        <p>Thank you.</p>\n        <a href=\"/\">Home</a>\n      ) : (");
    }

    @Test
    void aFileWithWindowsLineEndingsKeepsThem() {
        Applied applied = FileEdits.apply("const a = 1;\r\nconst b = 1;\r\n", block("const b = 1;\n", "const b = 2;\n"));

        assertThat(applied.content()).isEqualTo("const a = 1;\r\nconst b = 2;\r\n");
    }

    @Test
    void textThatIsNotInTheFileIsRefusedAndTheStartOfItIsQuotedBack() {
        Applied applied = FileEdits.apply(PAGE, block("    const [isSent, setIsSent] = useState(false);\n", "x\n"));

        assertThat(applied.failed()).isTrue();
        assertThat(applied.reason()).isEqualTo(FileEdits.NOT_FOUND + " - its first line is nowhere in the file");
        assertThat(applied.search()).contains("const [isSent, setIsSent]");
    }

    @Test
    void aRefusalSaysWhichLineOfTheCopyDiffersAndWhatTheFileHasThere() {
        Applied applied = FileEdits.apply(PAGE, block(
                "  const [formData, setFormData] = useState<InquiryData>({\n    fullName: \"\",\n", "x\n"));

        assertThat(applied.reason()).isEqualTo(FileEdits.NOT_FOUND
                + " - line 2 of it reads `fullName: \"\",` but the file, at its line 5, has `fullName: '',`");
    }

    @Test
    void linesCopiedWithTheirLineBreaksWrittenOutAsEscapesAreStillFound() {
        Applied applied = FileEdits.apply(PAGE, block(
                "  const [formData, setFormData] = useState<InquiryData>({\\n    fullName: '',\\n    phone: '',\n",
                "  const [formData, setFormData] = useState<InquiryData>({\n    fullName: '',\n    email: '',\n    phone: '',\n"));

        assertThat(applied.failed()).isFalse();
        assertThat(applied.content()).contains("    fullName: '',\n    email: '',\n    phone: '',\n  });");
    }

    @Test
    void anEditSentASecondTimeAfterItWasAppliedIsTakenAsDone() {
        String once = FileEdits.apply(PAGE, block("    <div className=\"page\">\n",
                "    <div className=\"page dark:bg-neutral-950 dark:text-neutral-100\">\n")).content();

        Applied again = FileEdits.apply(once, block("    <div className=\"page\">\n",
                "    <div className=\"page dark:bg-neutral-950 dark:text-neutral-100\">\n"));

        assertThat(again.failed()).isFalse();
        assertThat(again.content()).isEqualTo(once);
    }

    @Test
    void aReplacementTooShortToRecogniseIsNeverTakenAsAlreadyDone() {
        Applied applied = FileEdits.apply(PAGE, block("    save();\n  }\n", "  }\n"));

        assertThat(applied.failed()).isTrue();
    }

    @Test
    void textThatIsInTheFileTwiceIsRefusedRatherThanGuessedAt() {
        Applied applied = FileEdits.apply("<li>One</li>\n<li>One</li>\n", block("<li>One</li>\n", "<li>Two</li>\n"));

        assertThat(applied.failed()).isTrue();
        assertThat(applied.reason()).contains("matches 2 places");
    }

    @Test
    void theStrictestWayOfLookingDecidesSoAnExactMatchWinsOverALooserSecondOne() {
        Applied applied = FileEdits.apply("  save();\nsave();\n", block("save();\n", "store();\n"));

        assertThat(applied.content()).isEqualTo("  save();\nstore();\n");
    }

    @Test
    void anEditThatIsNotInSearchAndReplaceFormIsRefused() {
        assertThat(FileEdits.apply(PAGE, "export const a = 1;\n").reason()).isEqualTo(FileEdits.NOT_AN_EDIT);
        assertThat(FileEdits.apply(PAGE, "<<<<<<< SEARCH\n    phone: '',\n=======\n").reason()).isEqualTo(FileEdits.UNCLOSED);
        assertThat(FileEdits.apply(PAGE, block("", "const a = 1;\n")).reason()).isEqualTo(FileEdits.EMPTY_SEARCH);
    }

    @Test
    void aCodeFenceAroundTheBlocksIsIgnored() {
        Applied applied = FileEdits.apply(PAGE, "```tsx\n" + block("    phone: '',\n", "    phone: '+1',\n") + "```\n");

        assertThat(applied.content()).contains("    phone: '+1',\n");
    }

    @Test
    void anEditBecomesTheWholeFileItProduces() {
        Resolved resolved = resolve(Map.of("src/pages/Inquire.tsx", PAGE),
                patch("src/pages/Inquire.tsx", block("    phone: '',\n", "    phone: '+1',\n")));

        assertThat(resolved.isClean()).isTrue();
        assertThat(resolved.events()).singleElement().satisfies(event -> {
            assertThat(event.type()).isEqualTo(ChatEventType.FILE_EDIT);
            assertThat(event.content()).isEqualTo(PAGE.replace("phone: ''", "phone: '+1'"));
        });
    }

    @Test
    void twoEditsToOnePathBuildOnEachOtherAndLeaveOneFileWhereTheLastOneStood() {
        ParsedEvent first = new ParsedEvent(ChatEventType.FILE_PATCH, "a.ts", block("const a = 1;\n", "const a = 2;\n"), null, 0, 10);
        ParsedEvent message = new ParsedEvent(ChatEventType.MESSAGE, null, "And the other.", null, 10, 20);
        ParsedEvent second = new ParsedEvent(ChatEventType.FILE_PATCH, "a.ts", block("const a = 2;\n", "const a = 3;\n"), null, 20, 30);

        Resolved resolved = resolve(Map.of("a.ts", "const a = 1;\n"), first, message, second);

        assertThat(resolved.events()).extracting(ParsedEvent::type)
                .containsExactly(ChatEventType.MESSAGE, ChatEventType.FILE_EDIT);
        assertThat(resolved.events().getLast().content()).isEqualTo("const a = 3;\n");
        assertThat(resolved.events().getLast().start()).isEqualTo(20);
    }

    @Test
    void anEditAppliesToTheFileAsTheSameAnswerWroteItNotToTheStoredOne() {
        Resolved resolved = resolve(Map.of("a.ts", "const a = 0;\n"),
                file("a.ts", "const a = 1;\n"), patch("a.ts", block("const a = 1;\n", "const a = 2;\n")));

        assertThat(resolved.isClean()).isTrue();
        assertThat(resolved.events()).singleElement().extracting(ParsedEvent::content).isEqualTo("const a = 2;\n");
    }

    @Test
    void whenOneEditToAPathFailsNoneOfItsEditsAreAppliedAndTheOtherPathsStillAre() {
        Resolved resolved = resolve(Map.of("a.ts", "const a = 1;\n", "b.ts", "const b = 1;\n"),
                patch("a.ts", block("const a = 1;\n", "const a = 2;\n")),
                patch("b.ts", block("const b = 1;\n", "const b = 2;\n")),
                patch("a.ts", block("const missing = 1;\n", "const a = 3;\n")),
                patch("a.ts", block("const a = 2;\n", "const a = 4;\n")));

        assertThat(resolved.events()).singleElement().satisfies(event -> {
            assertThat(event.path()).isEqualTo("b.ts");
            assertThat(event.content()).isEqualTo("const b = 2;\n");
        });
        assertThat(resolved.problems()).singleElement().satisfies(problem -> {
            assertThat(problem.path()).isEqualTo("a.ts");
            assertThat(problem.reason()).startsWith(FileEdits.NOT_FOUND);
        });
        assertThat(resolved.unapplied()).hasSize(3).allMatch(event -> event.path().equals("a.ts"));
    }

    @Test
    void aFailedEditToAFileTheAnswerWroteWholeLeavesThatFileAsWritten() {
        Resolved resolved = resolve(Map.of(),
                file("a.ts", "const a = 1;\n"), patch("a.ts", block("const missing = 1;\n", "x\n")));

        assertThat(resolved.problems()).hasSize(1);
        assertThat(resolved.events()).singleElement().extracting(ParsedEvent::content).isEqualTo("const a = 1;\n");
    }

    @Test
    void anEditToAFileThatDoesNotExistOrWasDeletedIsRefused() {
        ParsedEvent delete = new ParsedEvent(ChatEventType.FILE_DELETE, "b.ts", "Unused", null, 0, 0);

        Resolved resolved = resolve(Map.of("b.ts", "const b = 1;\n"),
                patch("a.ts", block("const a = 1;\n", "const a = 2;\n")),
                delete, patch("b.ts", block("const b = 1;\n", "const b = 2;\n")));

        assertThat(resolved.problems()).extracting(FileEdits.Problem::reason)
                .containsExactly(FileEdits.MISSING_FILE, FileEdits.DELETED_FILE);
        assertThat(resolved.events()).containsExactly(delete);
    }

    @Test
    void eventsThatAreNotFileChangesPassThroughUntouched() {
        ParsedEvent message = new ParsedEvent(ChatEventType.MESSAGE, null, "Hello.", null, 0, 5);

        assertThat(resolve(Map.of(), message).events()).containsExactly(message);
    }
}
