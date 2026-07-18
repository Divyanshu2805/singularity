package com.vibecraft.intelligence.repository;

import com.vibecraft.intelligence.entity.UsageEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * The usage ledger. Every read takes the user: insights are only ever about the caller's own spending, the same
 * privacy rule ExplainLLM notes follow, so there is deliberately no query across users.
 */
public interface UsageEventRepository extends JpaRepository<UsageEvent, Long> {

    /** Events in a window, newest first - the activity table and the CSV export. */
    List<UsageEvent> findByUserIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtDesc(
            Long userId, Instant from, Instant to);

    List<UsageEvent> findByUserIdOrderByCreatedAtDescIdDesc(Long userId, Pageable pageable);

    long countByUserId(Long userId);

    Optional<UsageEvent> findFirstByUserIdOrderByCreatedAtDescIdDesc(Long userId);

    /**
     * Sums per (day, feature, project) in the given zone - the zone the daily quota counter rolls over in, so a
     * bar and the quota agree about which day a call belongs to. {@code cast(... as date)} rather than
     * {@code ::date}: a {@code ::} cast collides with Spring Data's named-parameter parsing in native queries.
     * Columns: bucket, feature, project_id, input, output, total, requests.
     */
    @Query(value = """
            select to_char(cast(e.created_at at time zone :zone as date), 'YYYY-MM-DD'), e.feature, e.project_id,
                   sum(e.input_tokens), sum(e.output_tokens), sum(e.total_tokens), count(*)
            from usage_events e
            where e.user_id = :userId and e.created_at >= :from and e.created_at < :to
            group by 1, 2, 3
            """, nativeQuery = true)
    List<Object[]> aggregateByDay(@Param("userId") Long userId, @Param("from") Instant from, @Param("to") Instant to,
                                  @Param("zone") String zone);

    /** As {@link #aggregateByDay}, bucketed by hour ("HH:00") - the Today view. */
    @Query(value = """
            select to_char(e.created_at at time zone :zone, 'HH24') || ':00', e.feature, e.project_id,
                   sum(e.input_tokens), sum(e.output_tokens), sum(e.total_tokens), count(*)
            from usage_events e
            where e.user_id = :userId and e.created_at >= :from and e.created_at < :to
            group by 1, 2, 3
            """, nativeQuery = true)
    List<Object[]> aggregateByHour(@Param("userId") Long userId, @Param("from") Instant from, @Param("to") Instant to,
                                   @Param("zone") String zone);

    @Query("select coalesce(sum(e.totalTokens), 0) from UsageEvent e "
            + "where e.userId = :userId and e.projectId = :projectId and e.createdAt >= :from and e.createdAt < :to")
    long sumForProjectBetween(@Param("userId") Long userId, @Param("projectId") Long projectId,
                              @Param("from") Instant from, @Param("to") Instant to);
}
