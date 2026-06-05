package com.java.vibecraft.config;

import com.java.vibecraft.entity.Plan;
import com.java.vibecraft.repository.PlanRepository;
import com.java.vibecraft.service.SubscriptionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * Puts the plan catalogue in the database at startup, and keeps it there.
 *
 * <p><b>Why a seeder rather than a migration.</b> This project has no migration tool - `ddl-auto: update`
 * creates columns and nothing else - so there is no other place for reference data to live. Running it every
 * boot also means the limits in code and the rows the app bills against can't drift: change a number here and
 * the next restart applies it.
 *
 * <p><b>Upsert keyed on the Stripe price id</b>, not on the plan id or name. A plan row's identity is the
 * thing Stripe charges against; matching on that makes re-seeding idempotent whatever ids the table already
 * handed out, and makes renaming a plan safe. The free plan has no Stripe price, so it matches on name.
 *
 * <p>The free plan's limits are read from {@link SubscriptionService}'s constants rather than written out
 * again here. Those constants are what actually gates a user with no subscription, so a second copy in this
 * file would be free to disagree with enforcement - the pricing page would promise one thing and the app do
 * another.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PlanSeeder implements ApplicationRunner {

    /** Named so the rest of the code can find the free plan without depending on a row id. */
    public static final String FREE_PLAN_NAME = "Free";

    private final PlanRepository planRepository;

    @Value("${stripe.price.pro}")
    private String proPriceId;

    @Value("${stripe.price.business}")
    private String businessPriceId;

    @Override
    public void run(ApplicationArguments args) {
        List<Plan> catalogue = List.of(
                Plan.builder()
                        .name(FREE_PLAN_NAME)
                        .tagline("Try it out and build something small.")
                        .stripePriceId(null)
                        .priceAmountMinor(0)
                        .currency("inr")
                        .billingInterval("month")
                        .maxProjects(SubscriptionService.FREE_TIER_PROJECTS_ALLOWED)
                        .maxTokensPerDay(SubscriptionService.FREE_TIER_DAILY_TOKENS)
                        .maxPreviews(SubscriptionService.FREE_TIER_PREVIEWS)
                        .unlimitedAi(false)
                        .active(true)
                        .sortOrder(0)
                        .build(),
                Plan.builder()
                        .name("Pro")
                        .tagline("For building real projects, week in week out.")
                        .stripePriceId(proPriceId)
                        .priceAmountMinor(49_900)
                        .currency("inr")
                        .billingInterval("month")
                        .maxProjects(3)
                        .maxTokensPerDay(100_000)
                        .maxPreviews(3)
                        .unlimitedAi(false)
                        .active(true)
                        .sortOrder(1)
                        .build(),
                Plan.builder()
                        .name("Business")
                        .tagline("For teams shipping several projects at once.")
                        .stripePriceId(businessPriceId)
                        .priceAmountMinor(149_900)
                        .currency("inr")
                        .billingInterval("month")
                        .maxProjects(10)
                        .maxTokensPerDay(500_000)
                        .maxPreviews(10)
                        .unlimitedAi(false)
                        .active(true)
                        .sortOrder(2)
                        .build());

        catalogue.forEach(this::upsert);
        log.info("Plan catalogue seeded: {} plans active", catalogue.size());
    }

    /**
     * Writes the plan, keeping whatever row already represents it. Only saves when something actually
     * differs, so an unchanged catalogue costs three selects and no writes on every boot.
     */
    private void upsert(Plan wanted) {
        Optional<Plan> existing = wanted.getStripePriceId() == null
                ? planRepository.findByNameIgnoreCase(wanted.getName())
                : planRepository.findByStripePriceId(wanted.getStripePriceId());

        if (existing.isEmpty()) {
            planRepository.save(wanted);
            log.info("Seeded new plan: {}", wanted.getName());
            return;
        }

        Plan plan = existing.get();
        if (!hasChanged(plan, wanted)) {
            return;
        }

        plan.setName(wanted.getName());
        plan.setTagline(wanted.getTagline());
        plan.setStripePriceId(wanted.getStripePriceId());
        plan.setPriceAmountMinor(wanted.getPriceAmountMinor());
        plan.setCurrency(wanted.getCurrency());
        plan.setBillingInterval(wanted.getBillingInterval());
        plan.setMaxProjects(wanted.getMaxProjects());
        plan.setMaxTokensPerDay(wanted.getMaxTokensPerDay());
        plan.setMaxPreviews(wanted.getMaxPreviews());
        plan.setUnlimitedAi(wanted.getUnlimitedAi());
        plan.setActive(wanted.getActive());
        plan.setSortOrder(wanted.getSortOrder());
        planRepository.save(plan);
        log.info("Updated plan: {} (id {})", plan.getName(), plan.getId());
    }

    private boolean hasChanged(Plan plan, Plan wanted) {
        return !java.util.Objects.equals(plan.getName(), wanted.getName())
                || !java.util.Objects.equals(plan.getTagline(), wanted.getTagline())
                || !java.util.Objects.equals(plan.getStripePriceId(), wanted.getStripePriceId())
                || !java.util.Objects.equals(plan.getPriceAmountMinor(), wanted.getPriceAmountMinor())
                || !java.util.Objects.equals(plan.getCurrency(), wanted.getCurrency())
                || !java.util.Objects.equals(plan.getBillingInterval(), wanted.getBillingInterval())
                || !java.util.Objects.equals(plan.getMaxProjects(), wanted.getMaxProjects())
                || !java.util.Objects.equals(plan.getMaxTokensPerDay(), wanted.getMaxTokensPerDay())
                || !java.util.Objects.equals(plan.getMaxPreviews(), wanted.getMaxPreviews())
                || !java.util.Objects.equals(plan.getUnlimitedAi(), wanted.getUnlimitedAi())
                || !java.util.Objects.equals(plan.getActive(), wanted.getActive())
                || !java.util.Objects.equals(plan.getSortOrder(), wanted.getSortOrder());
    }
}
