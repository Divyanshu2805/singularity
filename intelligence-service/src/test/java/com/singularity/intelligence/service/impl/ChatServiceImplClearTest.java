package com.singularity.intelligence.service.impl;

import com.singularity.common.error.ConflictException;
import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.repository.ChatEventRepository;
import com.singularity.intelligence.repository.ChatMessageRepository;
import com.singularity.intelligence.repository.ChatSessionRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers clearing a chat in {@link ChatServiceImpl}.
 *
 * <p>Handles: the caller's own events are deleted and then their turns, in that order, since a turn cannot go while
 * an event still points at it; only the caller's conversation in that project is named; the session row is kept; and
 * nothing is deleted while the caller has a response in progress.
 */
class ChatServiceImplClearTest {

    private static final long PROJECT_ID = 42L;
    private static final long USER_ID = 7L;

    private final ChatMessageRepository chatMessageRepository = mock(ChatMessageRepository.class);
    private final ChatEventRepository chatEventRepository = mock(ChatEventRepository.class);
    private final ChatSessionRepository chatSessionRepository = mock(ChatSessionRepository.class);
    private final AuthUtil authUtil = mock(AuthUtil.class);
    private final GenerationRegistry generationRegistry = mock(GenerationRegistry.class);

    private final ChatServiceImpl service = new ChatServiceImpl(chatMessageRepository, chatEventRepository,
            chatSessionRepository, authUtil, null, generationRegistry);

    @Test
    @DisplayName("clearing deletes the caller's events, then their turns, and keeps the session")
    void clearingDeletesEventsThenTurns() {
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(generationRegistry.find(PROJECT_ID, USER_ID)).thenReturn(Optional.empty());

        service.clearChat(PROJECT_ID);

        InOrder order = inOrder(chatEventRepository, chatMessageRepository);
        order.verify(chatEventRepository).deleteOfSession(PROJECT_ID, USER_ID);
        order.verify(chatMessageRepository).deleteOfSession(PROJECT_ID, USER_ID);
        verify(chatSessionRepository, never()).delete(org.mockito.ArgumentMatchers.any());
    }

    @Test
    @DisplayName("nothing is deleted while the caller has a response in progress")
    void clearingIsRefusedWhileAResponseIsInProgress() {
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(generationRegistry.find(PROJECT_ID, USER_ID)).thenReturn(Optional.of(mock(ActiveGeneration.class)));

        assertThatThrownBy(() -> service.clearChat(PROJECT_ID)).isInstanceOf(ConflictException.class);
        verify(chatEventRepository, never()).deleteOfSession(anyLong(), anyLong());
        verify(chatMessageRepository, never()).deleteOfSession(anyLong(), anyLong());
    }
}
