package com.vibecraft.workspace.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;

import java.time.Instant;

/**
 * One person's use of a project's preview. A {@link Preview} is the runner - one per project, shared, because
 * collaborators work on the same files and a second runner would only be a stale copy. A session is what makes it
 * <em>theirs</em>: a preview shows as running for someone only while they have an open session, their Stop ends
 * only their session, and their plan's preview allowance counts only their sessions. The runner is shut down once no
 * session is left on it.
 *
 * <p>Found 2026-09-16: before sessions existed, one collaborator starting a preview made it appear running for
 * everyone on the project, and any of them pressing Stop took it away from the others.
 */
@Entity
@Table(name = "preview_sessions", indexes = {
        @Index(name = "idx_preview_sessions_project_user", columnList = "project_id, user_id"),
        @Index(name = "idx_preview_sessions_preview_id", columnList = "preview_id"),
        @Index(name = "idx_preview_sessions_user_ended", columnList = "user_id, ended_at")
})
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

    /** Denormalised from the preview so "this user's session on this project" is a single-table lookup. */
    @Column(name = "project_id", nullable = false)
    Long projectId;

    @Column(name = "user_id", nullable = false)
    Long userId;

    Instant startedAt;

    /** The last time this person's app asked about the preview - their idle clock. */
    Instant lastSeenAt;

    /** Null while open. */
    Instant endedAt;

    /** Why it ended: "Stopped" when they pressed Stop, otherwise what ended it. */
    @Column(length = 500)
    String endReason;

    /** True when it ended because the runner failed to start - the one ending shown as an error. */
    Boolean failed;
}
