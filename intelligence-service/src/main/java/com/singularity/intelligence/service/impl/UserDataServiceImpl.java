package com.singularity.intelligence.service.impl;

import com.singularity.intelligence.repository.ChatEventRepository;
import com.singularity.intelligence.repository.ChatMessageRepository;
import com.singularity.intelligence.repository.ChatSessionRepository;
import com.singularity.intelligence.repository.CodeNoteRepository;
import com.singularity.intelligence.repository.GlossaryEntryRepository;
import com.singularity.intelligence.repository.ProjectTourRepository;
import com.singularity.intelligence.repository.UsageEventRepository;
import com.singularity.intelligence.repository.UsageLogRepository;
import com.singularity.intelligence.service.UserDataService;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Removes what intelligence-service holds about an account that is being deleted.
 *
 * <p>Handles: deleting, in one transaction, the account's chats - each turn's events, then the turns, then the
 * sessions, in the order their foreign keys need - its code notes, project tours and glossary words, and its usage
 * events and daily totals.
 *
 * <p>Usage is deleted with the rest: nothing else is kept about the person, and a new account made later with the
 * same address is a new user id with an allowance of its own either way. Anything still generating for the account
 * has already been stopped by workspace-service, which deletes or leaves each of its projects before this is called.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
public class UserDataServiceImpl implements UserDataService {

    ChatEventRepository chatEventRepository;
    ChatMessageRepository chatMessageRepository;
    ChatSessionRepository chatSessionRepository;
    CodeNoteRepository codeNoteRepository;
    ProjectTourRepository projectTourRepository;
    GlossaryEntryRepository glossaryEntryRepository;
    UsageEventRepository usageEventRepository;
    UsageLogRepository usageLogRepository;

    @Override
    @Transactional
    public void deleteAllFor(Long userId) {
        chatEventRepository.deleteAllOfUser(userId);
        int turns = chatMessageRepository.deleteAllOfUser(userId);
        chatSessionRepository.deleteAllOfUser(userId);
        codeNoteRepository.deleteAllOfUser(userId);
        projectTourRepository.deleteAllOfUser(userId);
        glossaryEntryRepository.deleteAllOfUser(userId);
        usageEventRepository.deleteAllOfUser(userId);
        usageLogRepository.deleteAllOfUser(userId);
        log.info("Deleted the intelligence data of user {} ({} chat turns)", userId, turns);
    }
}
