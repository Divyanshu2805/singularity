package com.vibecraft.account.service;

import com.vibecraft.account.dto.subscription.PlanResponse;

import java.util.List;

public interface PlanService {
    List<PlanResponse> getAllActivePlans();
}
