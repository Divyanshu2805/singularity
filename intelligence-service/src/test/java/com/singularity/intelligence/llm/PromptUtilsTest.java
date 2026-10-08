package com.singularity.intelligence.llm;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the properties of the build prompt that are easy to break without noticing: its text must be identical
 * between requests except for the last line (or the provider's prompt cache never hits), it must describe the starter
 * template that exists rather than a UI kit that does not, it must carry the rules for asking the user a question,
 * and it must ask for files to be read in one call and for imports to be checked - while never asking the model to
 * announce a read, which the server now records itself. It must also send the model to the files it has been shown
 * before any read, and tell it to keep what an existing file already does.
 *
 * <p>And the properties added after a first build read badly in the chat: the model's reasoning has its own tag and
 * its messages may not hold a plan or the request repeated back, the build stays inside what was asked, a request for
 * another stack or for a backend has a defined answer, and teaching mode adds nothing to the build - a lesson is
 * asked for separately, when the person opens a step.
 */
class PromptUtilsTest {

    @Test
    @DisplayName("the only part that changes between requests is the last line, and it is a date, not a time")
    void theChangingPartIsLast() {
        String prompt = PromptUtils.getSystemPrompt();
        String lastLine = prompt.strip().lines().reduce((first, second) -> second).orElseThrow();

        assertThat(lastLine).isEqualTo("Today's date: " + LocalDate.now());
        assertThat(prompt.substring(0, prompt.lastIndexOf("Today's date:")))
                .doesNotContain(String.valueOf(LocalDate.now().getYear()));
    }

    @Test
    @DisplayName("it does not tell the model to use a UI kit or helper the starter template does not have")
    void itDescribesTheTemplateThatExists() {
        String prompt = PromptUtils.getSystemPrompt();

        assertThat(prompt).doesNotContain("Prioritize @/components/ui").doesNotContain("Max 100 lines")
                .doesNotContain("{{").doesNotContain("react-query").doesNotContain("Zod");
        assertThat(prompt).contains("This project uses shadcn/ui").contains("NO daisyUI")
                .contains("import { Button } from \"@/components/ui/button\"").contains("`cn()` from \"@/lib/utils\"")
                .doesNotContain("daisyUI component classes");
    }

    @Test
    @DisplayName("a project made on the earlier kit is described as what it is, never told to import a kit it lacks")
    void aDaisyUiProjectGetsADaisyUiPrompt() {
        String prompt = PromptUtils.getSystemPrompt(UiKit.DAISYUI);

        assertThat(prompt).contains("NO shadcn/ui").contains("daisyUI component classes")
                .contains("load Tailwind and daisyUI").contains("+ daisyUI v5.")
                .doesNotContain("@/components/ui/button").doesNotContain("{{");
        assertThat(prompt.substring(0, prompt.indexOf("## 7. The UI kit")).replace("daisyUI v5", "shadcn/ui components"))
                .isEqualTo(PromptUtils.getSystemPrompt(UiKit.SHADCN).substring(0, PromptUtils.getSystemPrompt(UiKit.SHADCN).indexOf("## 7. The UI kit")));
    }

    @Test
    @DisplayName("the kit is read off the project's own files, and a project with no files gets the current one")
    void theKitIsReadOffTheProject() {
        assertThat(UiKit.of(java.util.List.of("package.json", "src/components/ui/button.tsx"))).isEqualTo(UiKit.SHADCN);
        assertThat(UiKit.of(java.util.List.of("package.json", "src/pages/Index.tsx"))).isEqualTo(UiKit.DAISYUI);
        assertThat(UiKit.of(java.util.List.of())).isEqualTo(UiKit.SHADCN);
        assertThat(UiKit.of(null)).isEqualTo(UiKit.SHADCN);
    }

    @Test
    @DisplayName("a one-sentence request is held to the smallest complete version of itself")
    void aOneLineRequestGetsTheSmallestCompleteVersion() {
        assertThat(PromptUtils.getSystemPrompt()).contains("A request of one sentence")
                .contains("the smallest complete version of it").contains("three to six files");
    }

    @Test
    @DisplayName("it explains when to ask the user - before building, or midway with a working part in place")
    void itCarriesTheAskRules() {
        String prompt = PromptUtils.getSystemPrompt();

        assertThat(prompt).contains("<ask options=").contains("**Asking before you build**")
                .contains("**Asking midway**").contains("never leave the app broken while you wait")
                .contains("they are always the LAST thing in it");
    }

    @Test
    @DisplayName("it gives the model's reasoning a tag of its own, and keeps plans and the request out of messages")
    void itSeparatesThinkingFromWhatIsSaid() {
        String prompt = PromptUtils.getSystemPrompt();

        assertThat(prompt).contains("**<approach>**").contains("Exactly one per response")
                .contains("Never repeat the request or the brief back to them")
                .contains("No plan, no list of files and no list of steps in a `<message>`")
                .contains("The checklist IS the plan");
        assertThat(prompt.indexOf("<approach>[Two to six short lines")).isLessThan(prompt.indexOf("<message phase=\"start\">Wrapping"));
    }

    @Test
    @DisplayName("it holds the build to what was asked, and treats a brief's keep-it-simple list as things not to build")
    void itKeepsTheBuildToWhatWasAsked() {
        String prompt = PromptUtils.getSystemPrompt();

        assertThat(prompt).contains("nothing it does not ask for")
                .contains("\"Keep it simple\" list is a list of things NOT to build");
    }

    @Test
    @DisplayName("it says what to do with a request for another stack or for a backend, instead of leaving it to chance")
    void itSaysWhatHappensOutsideTheStack() {
        String prompt = PromptUtils.getSystemPrompt();

        assertThat(prompt).contains("## 5. Stack boundaries").contains("do NOT write files in it")
                .contains("do not quietly build React instead").contains("there is no backend here")
                .contains("say in the final message what is simulated").contains("Never put a secret key in code");
    }

    @Test
    @DisplayName("teaching mode adds nothing to the build: neither the prompt nor the reply shape asks for a lesson")
    void theBuildNeverAsksForALesson() {
        String prompt = PromptUtils.getSystemPrompt();

        assertThat(prompt).doesNotContain("<learn").doesNotContain("<what>").doesNotContain("<why>")
                .doesNotContain("Teaching Mode");
        assertThat(PromptUtils.replyShape()).doesNotContain("<learn").doesNotContain("<what>");
        assertThat(PromptUtils.closingReminder()).doesNotContain("<learn");
    }

    @Test
    @DisplayName("it asks for every file in one read, and never for a tag announcing the read")
    void itAsksForOneReadAndNoAnnouncement() {
        String prompt = PromptUtils.getSystemPrompt();

        assertThat(prompt).contains("Ask for EVERY file you need in ONE call").contains("never write a `<tool>` tag yourself");
        assertThat(prompt).doesNotContain("<tool args=").doesNotContain("Generate the `<tool>` XML tag");
    }

    @Test
    @DisplayName("it points the model at the files it is shown before any read, and never opens its example with one")
    void itPutsTheShownFilesBeforeAnyRead() {
        String prompt = PromptUtils.getSystemPrompt();

        assertThat(prompt).contains("Look at the FILES shown to you below the FILE_TREE")
                .contains("If every file you need is shown, do not call `read_files` at all")
                .contains("A path that is not there does not exist yet");
        assertThat(prompt).doesNotContain("Let me check the current implementation")
                .doesNotContain("package.json is shown below the FILE_TREE already");
        assertThat(prompt.indexOf("## Complete Example Flow")).isLessThan(prompt.indexOf("Only if a file you need is NOT shown under FILES"));
    }

    @Test
    @DisplayName("it tells the model to keep what an existing file already does, never to write one out again from memory")
    void itAsksForExistingFilesToBeKept() {
        String prompt = PromptUtils.getSystemPrompt();

        assertThat(prompt).contains("Never write an existing file out again from memory")
                .contains("the theme tokens and the lines of src/index.css that load Tailwind");
    }

    @Test
    @DisplayName("an existing file is changed with an edit holding only the lines that change, never written out again")
    void itAsksForExistingFilesToBeChangedWithAnEdit() {
        String prompt = PromptUtils.getSystemPrompt();

        assertThat(prompt).contains("**<edit path=\"...\">**")
                .contains("<<<<<<< SEARCH").contains("=======").contains(">>>>>>> REPLACE")
                .contains("CHANGE, DON'T REWRITE")
                .contains("Never write an existing file out again in full to change a few lines of it")
                .contains("enough lines to appear only ONCE in the file");
        String example = prompt.substring(prompt.indexOf("## Complete Example Flow"), prompt.indexOf("## 3. Voice"));
        assertThat(example).contains("<edit path=\"src/main.tsx\">").contains("<<<<<<< SEARCH");
    }

    @Test
    @DisplayName("the skeleton under the request and the closing reminder both show the edit, since each is read last at a different moment")
    void theReplyShapeAndTheReminderShowTheEdit() {
        assertThat(PromptUtils.replyShape())
                .contains("<edit path=\"...\">\n<<<<<<< SEARCH\n").contains(">>>>>>> REPLACE\n</edit>")
                .contains("for every file that ALREADY EXISTS").contains("only for a file that does NOT exist yet");
        assertThat(PromptUtils.closingReminder()).contains("`<edit path=\"...\">`")
                .contains("never an existing file written out again in full");
    }

    @Test
    @DisplayName("the closing reminder restates the format, forbids code fences, and changes with nothing")
    void theClosingReminderRestatesTheFormat() {
        String reminder = PromptUtils.closingReminder();

        assertThat(reminder).contains("---- REMINDER ----").contains("`<message>`").contains("`<file path=\"...\">`")
                .contains("code fence").contains("never write anything outside a tag")
                .contains("`<approach>`").contains("never the request repeated back");
        assertThat(reminder).doesNotContain(String.valueOf(LocalDate.now().getYear()));
        assertThat(reminder).isEqualTo(PromptUtils.closingReminder());
    }

    @Test
    @DisplayName("the reply shape put under the request is a skeleton in order, never names a think tag, and changes with nothing")
    void theReplyShapeIsASkeletonTheModelCanCopy() {
        String shape = PromptUtils.replyShape();

        assertThat(shape).startsWith("\n\n---\n").contains("added by the system - not part of the user's request");
        assertThat(shape.indexOf("<approach>")).isLessThan(shape.indexOf("<message>ONE sentence"));
        assertThat(shape.indexOf("<message>ONE sentence")).isLessThan(shape.indexOf("<todo path="));
        assertThat(shape.indexOf("<todo path=")).isLessThan(shape.indexOf("<file path="));
        assertThat(shape).contains("never \"I am building\"").contains("no extra features of your own")
                .contains("<ask options=\"First answer|Second answer\">").contains("ask whether to build it in React");
        assertThat(shape).doesNotContain("<think>").doesNotContain("<learn").doesNotContain(String.valueOf(LocalDate.now().getYear()));
        assertThat(shape).isEqualTo(PromptUtils.replyShape());
    }

    @Test
    @DisplayName("the prompt never asks for a think tag, whose name reasoning models keep for themselves")
    void thePromptAsksForAnApproachNotAThinkTag() {
        assertThat(PromptUtils.getSystemPrompt()).doesNotContain("<think>");
        assertThat(PromptUtils.closingReminder()).doesNotContain("<think>");
    }

    @Test
    @DisplayName("it tells the model to check its imports and to write paths the way the file tree does")
    void itAsksForImportsToBeCheckedAndPlainPaths() {
        String prompt = PromptUtils.getSystemPrompt();

        assertThat(prompt).contains("Always check your imports before the final `<message>`")
                .contains("with no leading").contains("Tag names are lower case");
    }
}
