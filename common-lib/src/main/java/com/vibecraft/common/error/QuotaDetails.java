package com.vibecraft.common.error;

/**
 * Extra shape carried on a 402 {@link ApiError} so the client gets the numbers, not just a sentence.
 * Shared across domains on purpose: the limit itself is always Account's (a {@code Plan} field), but the
 * thing being counted is Workspace's (projects, previews) or Intelligence's (daily tokens) depending on
 * which quota tripped.
 */
public record QuotaDetails(
        String reason,
        long limit,
        long used
) {
}
