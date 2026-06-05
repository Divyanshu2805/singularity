package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.subscription.PlanResponse;
import com.java.vibecraft.mapper.PlanMapper;
import com.java.vibecraft.repository.PlanRepository;
import com.java.vibecraft.service.PlanService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class PlanServiceImpl implements PlanService {

    private final PlanRepository planRepository;
    private final PlanMapper planMapper;

    /**
     * The catalogue, cheapest first. Read straight from the database rather than from configuration, so what
     * the pricing page shows is exactly what checkout will charge against - {@code PlanSeeder} is the one
     * place the two are reconciled.
     */
    @Override
    public List<PlanResponse> getAllActivePlans() {
        return planMapper.fromListOfPlan(planRepository.findByActiveTrueOrderBySortOrderAsc());
    }
}
