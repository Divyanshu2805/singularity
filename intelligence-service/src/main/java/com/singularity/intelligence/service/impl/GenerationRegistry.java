package com.singularity.intelligence.service.impl;

import com.singularity.common.error.ConflictException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The build turns currently in progress, at most one per project - regardless of which member started it.
 *
 * <p>Handles: registering a new turn and refusing a second one for a project that already has one in progress, no
 * matter who owns either; finding the caller's own turn or every one running against a project; removing one when it
 * is finished; and clearing out one that has sat here far longer than any turn can run.
 *
 * <p>A second concurrent turn is refused because two responses rewriting the same files at once would each save over
 * the other - and that is exactly as true across two different collaborators as it is for the same person opening
 * two tabs. The check and the insert happen inside one {@code synchronized} block so two callers racing to start on
 * the same project can't both observe "nothing running yet". Removal targets the exact turn, so a late cleanup can
 * never remove a newer one that replaced it.
 *
 * <p>Lookups by (project, user) - reattaching to a turn after a refresh - stay scoped to the caller's own entry:
 * each member's chat is its own conversation, so a member asking after their own turn must never be handed the
 * content of someone else's, even though only one can run at a time. Stopping is by project, since whoever is
 * refused because a turn is running has to be able to end it; it reads nothing of the turn.
 *
 * <p>An entry that outlives {@link #STALE_AFTER} is treated as abandoned and replaced. A turn is bounded well inside
 * that by its own timeouts, so this should never fire; it exists because the one time an entry was left behind - a
 * model call that stalled with nothing timing it out - the project refused every later request with "someone is
 * already generating" until the service was restarted.
 *
 * <p>In memory, per instance. An orderly restart ends each turn in progress and records it first
 * ({@link GenerationShutdown}); a process that is killed outright loses the turn, since nothing of it had been saved
 * yet. With several instances a page must reach the instance running its turn, which needs sticky routing or a shared
 * broker.
 */
@Component
@Slf4j
public class GenerationRegistry {

    static final Duration STALE_AFTER = Duration.ofMinutes(45);

    private final ConcurrentHashMap<String, ActiveGeneration> active = new ConcurrentHashMap<>();
    private final Clock clock;

    public GenerationRegistry(Clock clock) {
        this.clock = clock;
    }

    private static String key(Long projectId, Long userId) {
        return projectId + ":" + userId;
    }

    synchronized ActiveGeneration start(Long projectId, Long userId, String userMessage) {
        for (ActiveGeneration running : findAllForProject(projectId)) {
            if (running.startedAt().plus(STALE_AFTER).isAfter(clock.instant())) {
                throw new ConflictException(
                        "Someone is already generating a response for this project. Wait for it to finish, or stop it first.");
            }
            log.error("Clearing a build turn for projectId: {} that has been registered since {} and never finished",
                    projectId, running.startedAt());
            remove(running);
            running.fail(new IllegalStateException("This response was abandoned"));
        }
        ActiveGeneration generation = new ActiveGeneration(projectId, userId, userMessage, clock.instant());
        active.put(key(projectId, userId), generation);
        return generation;
    }

    public Optional<ActiveGeneration> find(Long projectId, Long userId) {
        return Optional.ofNullable(active.get(key(projectId, userId)));
    }

    List<ActiveGeneration> findAllForProject(Long projectId) {
        return active.values().stream().filter(generation -> generation.projectId().equals(projectId)).toList();
    }

    List<ActiveGeneration> all() {
        return List.copyOf(active.values());
    }

    void remove(ActiveGeneration generation) {
        active.remove(key(generation.projectId(), generation.userId()), generation);
    }
}
