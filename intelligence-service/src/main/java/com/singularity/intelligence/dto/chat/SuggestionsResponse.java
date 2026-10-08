package com.singularity.intelligence.dto.chat;

import java.util.List;

/**
 * The next steps suggested under a finished build.
 *
 * <p>Handles: carrying up to three short requests, each ready to be sent as the person's next message. An empty list
 * is an ordinary answer and means there is nothing to offer.
 */
public record SuggestionsResponse(List<String> suggestions) {
}
