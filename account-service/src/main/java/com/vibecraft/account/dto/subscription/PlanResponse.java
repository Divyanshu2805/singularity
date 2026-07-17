package com.vibecraft.account.dto.subscription;

/**
 * One plan as the pricing page renders it.
 *
 * <p>{@code price} is preformatted server-side ("₹499", "Free") so no client has to decide how many decimal
 * places a currency has; {@code priceAmountMinor} travels alongside it for anything that needs to compare or
 * sort rather than print. {@code unlimitedAi} is reported for compatibility but is enforced nowhere.
 */
public record PlanResponse(
        Long id,
        String name,
        String tagline,
        Integer maxProjects,
        Integer maxTokensPerDay,
        /** Live previews that may run at once. */
        Integer maxPreviews,
        Boolean unlimitedAi,
        String price,
        Integer priceAmountMinor,
        String currency,
        String billingInterval,
        /** True for the plan a signed-up user is on before they ever pay - it has no Stripe price. */
        boolean isFree
) {
}
