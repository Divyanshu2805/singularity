package com.vibecraft.account.repository;

import com.vibecraft.account.entity.Subscription;
import com.vibecraft.account.enums.SubscriptionStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.Set;

/**
 * Reads and writes subscriptions.
 *
 * <p>Handles: finding a user's subscription in any of the entitling statuses, and finding or testing for one by its
 * Stripe subscription id - which is how every webhook locates the row it concerns.
 */
@Repository
public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {

    Optional<Subscription> findByUserIdAndStatusIn(Long userId, Set<SubscriptionStatus> statusSet);

    boolean existsByStripeSubscriptionId(String subscriptionId);

    Optional<Subscription> findByStripeSubscriptionId(String gatewaySubscriptionId);
}
