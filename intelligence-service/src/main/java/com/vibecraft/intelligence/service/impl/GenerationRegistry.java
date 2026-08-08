package com.vibecraft.intelligence.service.impl;

import com.vibecraft.common.error.ConflictException;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The generations currently running, at most one per project - regardless of which member started it.
 *
 * <p>Handles: registering a new generation and refusing a second one for a project that already has one running, no
 * matter who owns either, finding the caller's own generation or every one running against a project, and removing
 * one when it is finished.
 *
 * <p>A second concurrent generation is refused because two responses rewriting the same files at once would each save
 * over the other - and that is exactly as true across two different collaborators as it is for the same person
 * opening two tabs, since both write through the same project's files regardless of whose chat session asked for it.
 * The registration check and the insert happen inside one {@code synchronized} block so two callers racing to start
 * on the same project can't both observe "nothing running yet" before either has registered. Removal targets the
 * exact generation, so a late cleanup can never remove a newer one that replaced it.
 *
 * <p>Lookups by (project, user) - reattaching to or stopping a generation after a refresh - stay scoped to the
 * caller's own entry: each project member's chat is its own conversation (ChatSession is keyed by project and user),
 * so a member polling for their own active generation must never be handed the content of someone else's, even
 * though only one can run at a time.
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

    synchronized ActiveGeneration start(Long projectId, Long userId, String userMessage, boolean teachingMode) {
        if (!findAllForProject(projectId).isEmpty()) {
            throw new ConflictException(
                    "Someone is already generating a response for this project. Wait for it to finish, or stop it first.");
        }
        ActiveGeneration generation = new ActiveGeneration(projectId, userId, userMessage, teachingMode);
        active.put(key(projectId, userId), generation);
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
