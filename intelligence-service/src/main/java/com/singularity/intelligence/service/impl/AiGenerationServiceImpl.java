package com.singularity.intelligence.service.impl;

import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.dto.chat.ActiveGenerationResponse;
import com.singularity.intelligence.dto.chat.GenerationSignal;
import com.singularity.intelligence.entity.ChatEvent;
import com.singularity.intelligence.entity.ChatMessage;
import com.singularity.intelligence.entity.ChatSession;
import com.singularity.intelligence.entity.ChatSessionId;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.enums.MessageRole;
import com.singularity.intelligence.enums.UsageFeature;
import com.singularity.intelligence.llm.AiUsageRecorder;
import com.singularity.intelligence.llm.ConversationMemory;
import com.singularity.intelligence.repository.ChatMessageRepository;
import com.singularity.intelligence.repository.ChatSessionRepository;
import com.singularity.intelligence.service.AiGenerationService;
import com.singularity.intelligence.service.UsageService;
import com.singularity.intelligence.service.impl.BuildTurn.TurnRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.messages.Message;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executor;
import java.util.stream.Collectors;

/**
 * The way in to the build pipeline: starting a turn, watching one, and stopping one.
 *
 * <p>Handles: registering the turn and reserving the daily budget before anything starts, replaying the caller's own
 * recent turns on this project so the model has memory of earlier decisions, handing the turn to {@link BuildTurn} on
 * its own thread, attaching the caller to it as a viewer, reattaching after a refresh, and stopping it - on request,
 * or because workspace-service reports the project was deleted or the member removed.
 *
 * <p>The turn is registered first and the budget reserved second, so a project already mid-generation is refused
 * before it touches the daily counter. Both happen on the request thread, before the response has started, so either
 * refusal is a real HTTP status with its details on it - a 409, or a 402 carrying the quota numbers - not an error
 * event the client could not tell from a provider failure.
 *
 * <p>Anyone who may edit the project can stop the turn running on it, whoever started it. A project runs one turn
 * at a time for all its members, and stopping used to reach only the caller's own: an editor refused with "someone
 * is already generating - wait, or stop it first" had no way to do the second, and a turn left running by someone
 * who had closed their laptop held the project until its own time limit. Stopping hands over nothing of the other
 * person's conversation - the caller gets a 204 and the turn is recorded, as stopped, in its owner's chat. Watching
 * and reattaching stay scoped to the caller's own turn.
 *
 * <p>Stopping waits a moment for the turn to be recorded before returning, so the client that asked can reload the
 * conversation straight away and find the stopped turn in it. A turn that has already begun saving is past stopping;
 * the wait then simply covers the rest of the save.
 *
 * <p>Conversation memory is bounded and condensed ({@link ConversationMemory}): the caller's recent exchanges within
 * a fixed size, an assistant turn reduced to what it said, decided, asked and touched, and the exchange the project
 * was started from. It never crosses chat sessions, so it can never surface another member's conversation.
 */
@Service
@Slf4j
public class AiGenerationServiceImpl implements AiGenerationService {

    private static final Duration STOP_WAIT = Duration.ofSeconds(10);

    private final AuthUtil authUtil;
    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final UsageService usageService;
    private final AiUsageRecorder aiUsageRecorder;
    private final GenerationRegistry generationRegistry;
    private final BuildTurn buildTurn;
    private final Executor generationExecutor;

    public AiGenerationServiceImpl(AuthUtil authUtil, ChatSessionRepository chatSessionRepository,
                                   ChatMessageRepository chatMessageRepository,
                                   UsageService usageService, AiUsageRecorder aiUsageRecorder,
                                   GenerationRegistry generationRegistry, BuildTurn buildTurn,
                                   @Qualifier("generationExecutor") Executor generationExecutor) {
        this.authUtil = authUtil;
        this.chatSessionRepository = chatSessionRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.usageService = usageService;
        this.aiUsageRecorder = aiUsageRecorder;
        this.generationRegistry = generationRegistry;
        this.buildTurn = buildTurn;
        this.generationExecutor = generationExecutor;
    }

    @Override
    @PreAuthorize("@security.canEditProject(#projectId)")
    public Flux<GenerationSignal> streamResponse(String userMessage, Long projectId, boolean teaching) {
        Long userId = authUtil.getCurrentUserId();
        ActiveGeneration generation = generationRegistry.start(projectId, userId, userMessage);
        try {
            generation.setReservation(usageService.reserveBudget(UsageFeature.BUILD));
            ChatSession chatSession = createChatSessionIfNotExists(projectId, userId);
            List<ConversationMemory.Turn> remembered = rememberedTurns(chatSession);
            TurnRequest request = new TurnRequest(projectId, userId, userMessage, chatSession,
                    ConversationMemory.replay(remembered), teaching, ConversationMemory.recentlyTouched(remembered));
            generationExecutor.execute(() -> buildTurn.run(request, generation));
        } catch (RuntimeException e) {
            generationRegistry.remove(generation);
            aiUsageRecorder.release(generation.takeReservation());
            throw e;
        }
        return generation.watch();
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Optional<ActiveGenerationResponse> findActiveGeneration(Long projectId) {
        return generationRegistry.find(projectId, authUtil.getCurrentUserId())
                .map(generation -> new ActiveGenerationResponse(
                        generation.userMessage(),
                        generation.startedAt(),
                        generation.status().name()));
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Optional<Flux<GenerationSignal>> watchActiveGeneration(Long projectId) {
        return generationRegistry.find(projectId, authUtil.getCurrentUserId()).map(ActiveGeneration::watch);
    }

    @Override
    @PreAuthorize("@security.canEditProject(#projectId)")
    public boolean stopActiveGeneration(Long projectId) {
        Long callerId = authUtil.getCurrentUserId();
        List<ActiveGeneration> running = generationRegistry.findAllForProject(projectId);
        for (ActiveGeneration active : running) {
            if (active.requestStop()) {
                log.info("Generation for projectId: {} started by userId: {} stopped by userId: {}",
                        projectId, active.userId(), callerId);
            }
        }
        running.forEach(active -> active.awaitFinished(STOP_WAIT));
        return !running.isEmpty();
    }

    @Override
    public void stopGenerationsForProject(Long projectId, Long userId) {
        List<ActiveGeneration> generations = userId != null
                ? generationRegistry.find(projectId, userId).map(List::of).orElseGet(List::of)
                : generationRegistry.findAllForProject(projectId);

        for (ActiveGeneration generation : generations) {
            if (generation.requestStop()) {
                log.info("Stopped generation for projectId: {}, userId: {} (project or membership revoked)",
                        projectId, generation.userId());
            }
        }
    }

    List<Message> recentHistory(ChatSession chatSession) {
        return ConversationMemory.replay(rememberedTurns(chatSession));
    }

    private List<ConversationMemory.Turn> rememberedTurns(ChatSession chatSession) {
        return chatMessageRepository.findByChatSession(chatSession).stream()
                .map(AiGenerationServiceImpl::remembered)
                .toList();
    }

    static ConversationMemory.Turn remembered(ChatMessage turn) {
        if (turn.getRole() == MessageRole.USER) {
            return ConversationMemory.Turn.request(turn.getContent() == null ? "" : turn.getContent());
        }
        List<ChatEvent> events = turn.getEvents() == null ? List.of() : turn.getEvents();
        return ConversationMemory.Turn.reply(
                contentsOf(events, ChatEventType.MESSAGE).stream().collect(Collectors.joining(" ")),
                contentsOf(events, ChatEventType.THINKING),
                contentsOf(events, ChatEventType.ASK),
                events.stream()
                        .filter(event -> (event.getType() == ChatEventType.FILE_EDIT || event.getType() == ChatEventType.FILE_DELETE)
                                && event.getFilePath() != null)
                        .map(ChatEvent::getFilePath)
                        .distinct()
                        .toList());
    }

    private static List<String> contentsOf(List<ChatEvent> events, ChatEventType type) {
        return events.stream()
                .filter(event -> event.getType() == type)
                .map(ChatEvent::getContent)
                .filter(content -> content != null && !content.isBlank())
                .toList();
    }

    private ChatSession createChatSessionIfNotExists(Long projectId, Long userId) {
        ChatSessionId chatSessionId = new ChatSessionId(projectId, userId);
        return chatSessionRepository.findById(chatSessionId)
                .orElseGet(() -> chatSessionRepository.save(ChatSession.builder().id(chatSessionId).build()));
    }
}
