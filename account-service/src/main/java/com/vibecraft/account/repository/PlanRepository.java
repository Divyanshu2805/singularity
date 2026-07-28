package com.vibecraft.account.repository;

import com.vibecraft.account.entity.Plan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Reads and writes the plan catalogue.
 *
 * <p>Handles: the pricing page's list of active plans cheapest first, lookup by Stripe price id (how the seeder
 * upserts a paid plan), and lookup by name (how the free plan is found, since it has no Stripe price to key on).
 */
@Repository
public interface PlanRepository extends JpaRepository<Plan, Long> {
    Optional<Plan> findByStripePriceId(String id);

    List<Plan> findByActiveTrueOrderBySortOrderAsc();

    Optional<Plan> findByNameIgnoreCase(String name);
}
