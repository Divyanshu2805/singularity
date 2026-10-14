package com.singularity.intelligence.service.impl;

import com.singularity.intelligence.repository.ChatEventRepository;
import com.singularity.intelligence.repository.ChatMessageRepository;
import com.singularity.intelligence.repository.ChatSessionRepository;
import com.singularity.intelligence.repository.CodeNoteRepository;
import com.singularity.intelligence.repository.GlossaryEntryRepository;
import com.singularity.intelligence.repository.ProjectTourRepository;
import com.singularity.intelligence.repository.UsageEventRepository;
import com.singularity.intelligence.repository.UsageLogRepository;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * What intelligence-service removes for an account being deleted: every kind of row it keeps about a person, with a
 * chat's events before its turns and its turns before its sessions, the order their foreign keys allow.
 */
class UserDataServiceImplTest {

    private final ChatEventRepository chatEvents = mock(ChatEventRepository.class);
    private final ChatMessageRepository chatMessages = mock(ChatMessageRepository.class);
    private final ChatSessionRepository chatSessions = mock(ChatSessionRepository.class);
    private final CodeNoteRepository codeNotes = mock(CodeNoteRepository.class);
    private final ProjectTourRepository tours = mock(ProjectTourRepository.class);
    private final GlossaryEntryRepository glossary = mock(GlossaryEntryRepository.class);
    private final UsageEventRepository usageEvents = mock(UsageEventRepository.class);
    private final UsageLogRepository usageLogs = mock(UsageLogRepository.class);

    private final UserDataServiceImpl service = new UserDataServiceImpl(
            chatEvents, chatMessages, chatSessions, codeNotes, tours, glossary, usageEvents, usageLogs);

    @Test
    void deletesEveryRowOfTheAccountInForeignKeyOrder() {
        service.deleteAllFor(7L);

        InOrder chat = inOrder(chatEvents, chatMessages, chatSessions);
        chat.verify(chatEvents).deleteAllOfUser(7L);
        chat.verify(chatMessages).deleteAllOfUser(7L);
        chat.verify(chatSessions).deleteAllOfUser(7L);
        verify(codeNotes).deleteAllOfUser(7L);
        verify(tours).deleteAllOfUser(7L);
        verify(glossary).deleteAllOfUser(7L);
        verify(usageEvents).deleteAllOfUser(7L);
        verify(usageLogs).deleteAllOfUser(7L);
    }
}
