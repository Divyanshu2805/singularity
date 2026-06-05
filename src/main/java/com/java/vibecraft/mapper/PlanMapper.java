package com.java.vibecraft.mapper;

import com.java.vibecraft.dto.subscription.PlanResponse;
import com.java.vibecraft.entity.Plan;
import com.java.vibecraft.util.MoneyFormat;
import org.mapstruct.Mapper;

import java.util.List;

/**
 * Hand-written rather than generated: two of the fields are decisions, not field-name matches - {@code price}
 * is formatted from the amount and currency together, and {@code isFree} means "has no Stripe price" rather
 * than "costs zero", so a free plan stays free even if someone puts an amount on it by mistake.
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
