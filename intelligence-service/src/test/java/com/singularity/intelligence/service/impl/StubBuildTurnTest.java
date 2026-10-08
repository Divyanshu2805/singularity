package com.singularity.intelligence.service.impl;

import com.singularity.intelligence.config.AiCallProperties;
import com.singularity.intelligence.config.GenerationProperties;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.enums.TurnOutcome;
import com.singularity.intelligence.llm.stub.StubChatModel;
import com.singularity.intelligence.llm.stub.StubReplies;
import com.singularity.intelligence.service.impl.TurnHarness.TurnResult;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.prompt.Prompt;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Runs the scripted model through the whole build turn, on the real starter template, and through the interview.
 *
 * <p>The stub is only worth having if what it writes survives everything a real reply goes through: the parser, the
 * edits applied to the files as they stand, the syntax check, the import check. So these are whole turns, not checks
 * of the script's text - a first build on a new project, a change to the app that build left, a request the workspace
 * cannot build, a question, and a request with nothing left to script. Each must end the way a good real turn does,
 * in one call, with nothing to repair; a script that drifted from the template would show here as a second call and
 * a note. The interview's two calls are answered here too, through the service's own prompts and its own reading of
 * the reply, because the stub recognises a call by the opening words of a prompt this package owns.
 */
class StubBuildTurnTest {

    private final StubChatModel model = new StubChatModel(Duration.ZERO);
    private final TurnHarness harness = new TurnHarness(ChatClient.builder(model).build(),
            ScratchProject.fromStarterTemplate(), GenerationProperties.defaults(), AiCallProperties.defaults());

    @Test
    void aFirstBuildWritesAWorkingAppInOneCallWithNothingToRepair() {
        TurnResult turn = harness.send("**Build:** A quick notes app.");

        assertThat(turn.outcome()).isEqualTo(TurnOutcome.SAVED);
        assertThat(turn.notices()).isEmpty();
        assertThat(turn.calls()).isEqualTo(1);
        assertThat(turn.touched()).contains("src/lib/notes.ts", "src/components/NoteList.tsx", "src/pages/Index.tsx");
        assertThat(turn.count(ChatEventType.TODO)).isEqualTo(turn.touched().size());
        assertThat(turn.said()).hasSize(2);
        assertThat(harness.project().content("src/pages/Index.tsx"))
                .contains("Quick Notes").doesNotContain("Your app starts here");
        assertThat(turn.promptTokens()).isPositive();
        assertThat(turn.completionTokens()).isPositive();
    }

    @Test
    void aFirstBuildNamesThePageWhenTheTemplatesTitleIsStillThere() {
        boolean templateHasTheTitle = harness.project().content("index.html").contains("<title>New project</title>");

        harness.send("**Build:** A quick notes app.");

        assertThat(harness.project().content("index.html").contains("<title>Quick Notes</title>"))
                .isEqualTo(templateHasTheTitle);
    }

    @Test
    void theNextRequestChangesTheAppWithAnEditThatApplies() {
        harness.send("**Build:** A quick notes app.");

        TurnResult turn = harness.send("show how many notes there are");

        assertThat(turn.outcome()).isEqualTo(TurnOutcome.SAVED);
        assertThat(turn.notices()).isEmpty();
        assertThat(turn.calls()).isEqualTo(1);
        assertThat(turn.touched()).containsExactly("src/components/NoteCount.tsx", "src/pages/Index.tsx");
        assertThat(harness.project().content("src/pages/Index.tsx"))
                .contains("import { NoteCount } from \"../components/NoteCount\";")
                .contains("<NoteCount count={notes.length} />")
                .contains("<NoteList notes={notes} onRemove={remove} />");
    }

    @Test
    void aThirdRequestFindsNothingLeftToScriptAndSaysSoWithoutWritingAFile() {
        harness.send("**Build:** A quick notes app.");
        harness.send("show how many notes there are");

        TurnResult turn = harness.send("make it better");

        assertThat(turn.outcome()).isEqualTo(TurnOutcome.ANSWERED);
        assertThat(turn.touched()).isEmpty();
    }

    @Test
    void aRequestForAnotherStackIsAnsweredWithAQuestionAndNoFiles() {
        TurnResult turn = harness.send("build me a todo app in Vue");

        assertThat(turn.outcome()).isEqualTo(TurnOutcome.ANSWERED);
        assertThat(turn.asked()).containsExactly("Shall I build the same thing in React?");
        assertThat(turn.touched()).isEmpty();
        assertThat(harness.project().has("src/lib/notes.ts")).isFalse();
    }

    @Test
    void aQuestionAboutTheProjectIsAnsweredInWords() {
        TurnResult turn = harness.send("how does the routing work?");

        assertThat(turn.outcome()).isEqualTo(TurnOutcome.ANSWERED);
        assertThat(turn.said()).hasSize(1);
        assertThat(turn.touched()).isEmpty();
    }

    @Test
    void theInterviewsQuestionsComeBackInTheShapeTheServiceReads() {
        String system = IdeaServiceImpl.CLARIFY_SYSTEM_PROMPT_TEMPLATE.formatted(IdeaServiceImpl.MAX_QUESTIONS);
        assertThat(StubReplies.callOf(system)).isEqualTo(StubReplies.Call.INTERVIEW);

        String reply = model.call(new Prompt(List.of(new SystemMessage(system), new UserMessage("a notes app"))))
                .getResult().getOutput().getText();

        IdeaServiceImpl.GeneratedInterview interview = IdeaServiceImpl.QUESTIONS_CONVERTER.convert(reply);
        assertThat(interview.questions()).hasSize(2);
        assertThat(interview.questions().getFirst().options()).hasSize(3);
    }

    @Test
    void theCompiledBriefComesBackAsABrief() {
        assertThat(StubReplies.callOf(IdeaServiceImpl.COMPILE_SYSTEM_PROMPT)).isEqualTo(StubReplies.Call.BRIEF);

        String reply = model.call(new Prompt(List.of(new SystemMessage(IdeaServiceImpl.COMPILE_SYSTEM_PROMPT),
                new UserMessage("Idea: a notes app")))).getResult().getOutput().getText();

        assertThat(reply).startsWith("**Build:**").contains("**Keep it simple:**");
    }
}
