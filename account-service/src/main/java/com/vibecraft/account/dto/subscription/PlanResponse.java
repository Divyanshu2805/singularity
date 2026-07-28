package com.vibecraft.account.dto.subscription;

/**
 * One plan as the pricing page renders it.
 *
 * <p>Handles: the limits, the tagline, the billing interval and both forms of the price - preformatted server-side
 * ("Rs 499", "Free") so no client has to decide how many decimal places a currency has, and as a raw minor-unit
 * amount for anything that compares or sorts rather than prints. isFree means the plan has no Stripe price, not that
 * it costs zero.
 */
public record PlanResponse(
        Long id,
        String name,
        String tagline,
        Integer maxProjects,
        Integer maxTokensPerDay,
        Integer maxPreviews,
        Boolean unlimitedAi,
        String price,
        Integer priceAmountMinor,
        String currency,
        String billingInterval,
        boolean isFree
) {
}
