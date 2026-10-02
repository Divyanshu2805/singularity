package com.singularity.account.service;

import com.singularity.account.dto.subscription.PlanResponse;

import java.util.List;

/**
 * The plan catalogue as the pricing page reads it.
 *
 * <p>Handles: listing the active plans.
 */
public interface PlanService {
    List<PlanResponse> getAllActivePlans();
}
