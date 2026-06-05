package com.java.vibecraft.mapper;

import com.java.vibecraft.dto.subscription.SubscriptionResponse;
import com.java.vibecraft.entity.Subscription;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

/**
 * {@code periodStart}/{@code periodEnd} need explicit mappings because the entity calls them
 * {@code currentPeriodStart}/{@code currentPeriodEnd}. Without them MapStruct matches nothing, generates
 * {@code Instant periodEnd = null}, and compiles clean - the same silent trap that left
 * {@code FileNode.modifiedAt} null on every response until 2026-09-14. A renewal date that is always absent
 * is the sort of bug nobody reports; they just assume the app doesn't show one.
 */
@Mapper(componentModel = "spring", uses = PlanMapper.class)
public interface SubscriptionMapper {

    @Mapping(target = "periodStart", source = "currentPeriodStart")
    @Mapping(target = "periodEnd", source = "currentPeriodEnd")
    @Mapping(target = "isFree", constant = "false")
    SubscriptionResponse toSubscriptionResponse(Subscription subscription);
}
