package com.vibecraft.account.mapper;

import com.vibecraft.account.dto.subscription.PlanResponse;
import com.vibecraft.account.entity.Plan;
import com.vibecraft.account.util.MoneyFormat;
import org.mapstruct.Mapper;

import java.util.List;

/**
 * Turns a plan row into the shape the pricing page reads.
 *
 * <p>Handles: copying the limits across, formatting the price from the amount and currency together, and deciding
 * isFree.
 *
 * <p>Hand-written rather than generated because two of the fields are decisions, not field-name matches: the
 * formatted price, and isFree meaning "has no Stripe price" rather than "costs zero", so a free plan stays free even
 * if someone puts an amount on it by mistake.
 */
@Mapper(componentModel = "spring")
public interface PlanMapper {

    default PlanResponse toPlanResponse(Plan plan) {
        if (plan == null) {
            return null;
        }
        return new PlanResponse(
                plan.getId(),
                plan.getName(),
                plan.getTagline(),
                plan.getMaxProjects(),
                plan.getMaxTokensPerDay(),
                plan.getMaxPreviews(),
                plan.getUnlimitedAi(),
                MoneyFormat.format(plan.getPriceAmountMinor(), plan.getCurrency()),
                plan.getPriceAmountMinor(),
                plan.getCurrency(),
                plan.getBillingInterval(),
                plan.getStripePriceId() == null || plan.getStripePriceId().isBlank());
    }

    default List<PlanResponse> fromListOfPlan(List<Plan> plans) {
        return plans == null ? List.of() : plans.stream().map(this::toPlanResponse).toList();
    }
}
