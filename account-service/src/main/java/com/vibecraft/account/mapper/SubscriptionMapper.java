package com.vibecraft.account.mapper;

import com.vibecraft.account.dto.subscription.SubscriptionResponse;
import com.vibecraft.account.entity.Subscription;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

/**
 * {@code periodStart}/{@code periodEnd} need explicit mappings because the entity calls them
 * {@code currentPeriodStart}/{@code currentPeriodEnd}. Without them MapStruct matches nothing and compiles
 * clean with a null field - see docs/schema/'s mapper gotcha.
 */
@Mapper(componentModel = "spring", uses = PlanMapper.class)
public interface SubscriptionMapper {

    @Mapping(target = "periodStart", source = "currentPeriodStart")
    @Mapping(target = "periodEnd", source = "currentPeriodEnd")
    @Mapping(target = "isFree", constant = "false")
    SubscriptionResponse toSubscriptionResponse(Subscription subscription);
}
