package com.vibecraft.account.enums;

/**
 * Where a Stripe webhook delivery is in its own processing.
 *
 * <p>Handles: naming the two states. RECEIVED means "claimed, not (yet) fully applied" - a delivery still in
 * flight, or one whose handler threw, both look like this and are equally eligible to be reclaimed by a retry.
 * PROCESSED means the event's side effects were fully applied and it must never run again.
 */
public enum WebhookEventStatus {
    RECEIVED, PROCESSED
}
