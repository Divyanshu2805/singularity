package com.vibecraft.account.service;

import com.vibecraft.account.dto.subscription.PlanResponse;

import java.util.List;

/**
 * The plan catalogue as the pricing page reads it.
 *
 * <p>Handles: listing the active plans.
 */
public interface PlanService {
    List<PlanResponse> getAllActivePlans();
}
