package com.vibecraft.account.service.impl;

import com.vibecraft.account.dto.subscription.PlanResponse;
import com.vibecraft.account.mapper.PlanMapper;
import com.vibecraft.account.repository.PlanRepository;
import com.vibecraft.account.service.PlanService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Serves the plan catalogue.
 *
 * <p>Handles: reading the active plans cheapest first and mapping them for the pricing page.
 *
 * <p>Read straight from the database rather than from configuration, so what the pricing page shows is exactly what
 * checkout will charge against; PlanSeeder is the one place the two are reconciled.
 */
@Service
@RequiredArgsConstructor
public class PlanServiceImpl implements PlanService {

    private final PlanRepository planRepository;
    private final PlanMapper planMapper;

    @Override
    public List<PlanResponse> getAllActivePlans() {
        return planMapper.fromListOfPlan(planRepository.findByActiveTrueOrderBySortOrderAsc());
    }
}
