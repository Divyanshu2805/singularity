package com.vibecraft.intelligence.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

@Entity
@Table(name = "chat_sessions")
@Getter @Setter @NoArgsConstructor
/**
 * One person's chat on one project.
 *
 * <p>Handles: the composite project-and-user key, the timestamps, and a nullable deletedAt for soft deletion.
 *
 * <p>There are no project or user relations: those live in other services' databases and are never joinable locally,
 * so the key carries both ids as plain values. Two members of a shared project therefore keep separate chats.
 */
@AllArgsConstructor
@Builder
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ChatSession {

    @EmbeddedId
    ChatSessionId id;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    Instant createdAt;

    @UpdateTimestamp
    Instant updatedAt;

    Instant deletedAt;
}
