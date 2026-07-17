package com.java.vibecraft.service.impl;

import com.java.vibecraft.error.ConflictException;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The generations currently running, at most one per project per user - the same scope as a {@code ChatSession},
 * so it's also exactly what a refreshed page needs to find its own response and nobody else's.
 *
 * <p>In memory, per server instance. A server restart loses a response mid-generation (nothing was saved yet, as
 * before), and with several instances a page must reach the instance running its generation - sticky sessions, or a
 * shared broker such as Redis pub/sub, once there is more than one.
 */
@Component
public class GenerationRegistry {

    private final ConcurrentHashMap<String, ActiveGeneration> active = new ConcurrentHashMap<>();

    private static String key(Long projectId, Long userId) {
        return projectId + ":" + userId;
    }

    /**
     * Registers a new generation, refusing a second one for the same project and user: two responses rewriting the
     * same files at once would each save over the other, and a refreshed page couldn't tell which to show.
     */
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

    /** Removes only this exact generation, so a late cleanup can never remove a newer one that replaced it. */
    void remove(ActiveGeneration generation) {
        active.remove(key(generation.projectId(), generation.userId()), generation);
    }
}
