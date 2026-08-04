package com.vibecraft.intelligence.service.impl;

import com.vibecraft.common.error.ConflictException;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The generations currently running, at most one per project per user.
 *
 * <p>Handles: registering a new generation and refusing a second one for the same project and user, finding the
 * caller's own or every one running against a project, and removing one when it is finished.
 *
 * <p>A second concurrent generation is refused because two responses rewriting the same files at once would each save
 * over the other, and a refreshed page could not tell which to show. Removal targets the exact generation, so a late
 * cleanup can never remove a newer one that replaced it.
 *
 * <p>In memory, per instance. A restart loses a response mid-generation - nothing had been saved yet - and with
 * several instances a page must reach the instance running its generation, which needs sticky routing or a shared
 * broker.
 */
@Component
public class GenerationRegistry {

    private final ConcurrentHashMap<String, ActiveGeneration> active = new ConcurrentHashMap<>();

    private static String key(Long projectId, Long userId) {
        return projectId + ":" + userId;
    }

    ActiveGeneration start(Long projectId, Long userId, String userMessage, boolean teachingMode) {
        ActiveGeneration generation = new ActiveGeneration(projectId, userId, userMessage, teachingMode);
        ActiveGeneration existing = active.putIfAbsent(key(projectId, userId), generation);
        if (existing != null) {
            throw new ConflictException("A response is already being generated for this project. Wait for it to finish, or stop it first.");
        }
        return generation;
    }

    public Optional<ActiveGeneration> find(Long projectId, Long userId) {
        return Optional.ofNullable(active.get(key(projectId, userId)));
    }

    List<ActiveGeneration> findAllForProject(Long projectId) {
        return active.values().stream().filter(generation -> generation.projectId().equals(projectId)).toList();
    }

    void remove(ActiveGeneration generation) {
        active.remove(key(generation.projectId(), generation.userId()), generation);
    }
}
