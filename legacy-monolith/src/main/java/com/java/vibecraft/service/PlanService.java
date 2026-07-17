package com.java.vibecraft.service;

import com.java.vibecraft.dto.subscription.PlanResponse;

import java.util.List;

public interface PlanService {
     List<PlanResponse> getAllActivePlans();
}
