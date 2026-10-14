package com.singularity.intelligence.dto.chat;

import java.util.List;

/**
 * The titles written for the caller's own messages in a project's build chat.
 *
 * <p>Handles: one entry per message that was given a title by this request - the message's id and its title, at
 * most eight words. Messages that already had one, or that the model gave nothing usable for, are not listed; an
 * empty list is a normal answer.
 */
public record MessageTitlesResponse(
        List<MessageTitle> titles
) {
    public record MessageTitle(Long messageId, String title) {
    }
}
