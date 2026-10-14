package com.singularity.intelligence.service;

import com.singularity.intelligence.dto.chat.MessageTitlesResponse.MessageTitle;

import java.util.List;

/**
 * Titles the caller's own messages in a project's build chat.
 *
 * <p>Handles: one operation - a title of at most eight words for each of the caller's messages on the project that has
 * none yet, written by a model in one call and stored; empty when there is nothing to title or nothing to spend.
 */
public interface MessageTitleService {

    List<MessageTitle> titleMessages(Long projectId);
}
