package com.singularity.intelligence.service.impl;

import com.singularity.common.error.ExternalServiceException;
import com.singularity.intelligence.entity.ChatSession;
import com.singularity.intelligence.entity.ChatSessionId;
import com.singularity.intelligence.enums.TurnOutcome;
import com.singularity.intelligence.llm.FileEdits;
import com.singularity.intelligence.llm.LlmResponseParser;
import com.singularity.intelligence.llm.stub.StubReplies;
import com.singularity.intelligence.repository.ChatSessionRepository;
import com.singularity.intelligence.service.DemoProjectService;
import com.singularity.intelligence.service.ProjectFileReader;
import com.singularity.intelligence.service.impl.TurnRecorder.TurnRecord;
import feign.FeignException;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * Records the demo account's sample build: the scripted model's brief and first build, saved as a real turn.
 *
 * <p>Handles: parsing the scripted first build with the turn's own parser, applying its one edit against the project's
 * stored files as a build turn does, and handing the result to TurnRecorder - so the files land as one revision and
 * the chat holds the same message, plan, steps and closing words a build leaves, exactly as the browser journey sees
 * them. No model is called and nothing is metered.
 *
 * <p>The scripted replies are the stub model's (StubReplies) on purpose: the README's screenshots were taken of that
 * build, so the demo account and the screenshots stay the same project. A turn that would not save in full is an
 * error rather than a half-built sample: account-service's reset fails, logs it and runs again the next day.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
public class DemoProjectSeeder implements DemoProjectService {

    static final long WORKED_SECONDS = 1;

    ChatSessionRepository chatSessionRepository;
    LlmResponseParser llmResponseParser;
    ProjectFileReader projectFileReader;
    TurnRecorder turnRecorder;

    @Override
    public void recordFirstBuild(Long projectId, Long userId) {
        ChatSessionId id = new ChatSessionId(projectId, userId);
        ChatSession chatSession = chatSessionRepository.findById(id)
                .orElseGet(() -> chatSessionRepository.save(ChatSession.builder().id(id).build()));

        LlmResponseParser.ParsedTurn parsed = llmResponseParser.parse(StubReplies.demoFirstBuild());
        FileEdits.Resolved resolved = FileEdits.resolve(parsed.events(), path -> stored(projectId, path));
        if (!resolved.isClean()) {
            throw new IllegalStateException("The demo build's edits did not apply to project " + projectId + ": "
                    + resolved.problems());
        }

        TurnOutcome outcome = turnRecorder.record(new TurnRecord(chatSession, StubReplies.demoBrief(),
                resolved.events(), null, List.of(), WORKED_SECONDS, null, null));
        if (outcome != TurnOutcome.SAVED) {
            throw new ExternalServiceException("The demo build for project " + projectId + " ended " + outcome, null);
        }
        log.info("Recorded the demo account's first build on project {}", projectId);
    }

    private Optional<String> stored(Long projectId, String path) {
        try {
            return Optional.ofNullable(projectFileReader.getFileContent(projectId, path).content());
        } catch (FeignException.NotFound e) {
            return Optional.empty();
        }
    }
}
