package com.vibecraft.workspace.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;

import java.time.Instant;

@Entity
@Table(name = "preview_sessions", indexes = {
        @Index(name = "idx_preview_sessions_project_user", columnList = "project_id, user_id"),
        @Index(name = "idx_preview_sessions_preview_id", columnList = "preview_id"),
        @Index(name = "idx_preview_sessions_user_ended", columnList = "user_id, ended_at")
})
/**
 * One person's use of a project's preview.
 *
 * <p>Handles: who has it open on which project, their own idle clock, and how and when their session ended -
 * including whether it ended because the runner failed.
 *
 * <p>The distinction it exists for: a preview row is the runner, one per project and shared, because collaborators
 * work on the same files and a second runner would only be a stale copy. A session is what makes it theirs - a
 * preview shows as running for someone only while they have a session open, their Stop ends only their session, and
 * their plan's allowance counts only their sessions. The runner shuts down once no session is left on it. Without
 * sessions, one collaborator starting a preview made it appear running for everyone, and any of them pressing Stop
 * took it away from the others.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PreviewSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "preview_id", nullable = false)
    Preview preview;

    @Column(name = "project_id", nullable = false)
    Long projectId;

    @Column(name = "user_id", nullable = false)
    Long userId;

    Instant startedAt;

    Instant lastSeenAt;

    Instant endedAt;

    @Column(length = 500)
    String endReason;

    Boolean failed;
}
