package com.vibecraft.account.repository;

import com.vibecraft.account.entity.Plan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PlanRepository extends JpaRepository<Plan, Long> {
    Optional<Plan> findByStripePriceId(String id);

    /** The pricing page's catalogue, cheapest first - plan ids are insertion order and say nothing about price. */
    List<Plan> findByActiveTrueOrderBySortOrderAsc();

    /** How the free plan is found: it has no Stripe price to key on. */
    Optional<Plan> findByNameIgnoreCase(String name);
}
