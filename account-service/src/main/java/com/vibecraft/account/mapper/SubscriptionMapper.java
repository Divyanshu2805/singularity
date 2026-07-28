package com.vibecraft.account.mapper;

import com.vibecraft.account.dto.subscription.SubscriptionResponse;
import com.vibecraft.account.entity.Subscription;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

/**
 * Turns a subscription row into the shape the billing page reads.
 *
 * <p>Handles: the plan, the status, the period and the cancel-at-period-end flag.
 *
 * <p>periodStart and periodEnd need explicit mappings because the entity calls them currentPeriodStart and
 * currentPeriodEnd. Without them MapStruct matches nothing, compiles clean, and leaves the field null.
 */
@Mapper(componentModel = "spring", uses = PlanMapper.class)
public interface SubscriptionMapper {

    @Mapping(target = "periodStart", source = "currentPeriodStart")
    @Mapping(target = "periodEnd", source = "currentPeriodEnd")
    @Mapping(target = "isFree", constant = "false")
    SubscriptionResponse toSubscriptionResponse(Subscription subscription);
}
