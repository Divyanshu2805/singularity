package com.singularity.workspace.entity;

import com.singularity.workspace.enums.PreviewFailureKind;
import com.singularity.workspace.enums.PreviewStatus;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

@Entity
@Table(name = "previews", indexes = {
        @Index(name = "idx_previews_project_id", columnList = "project_id"),
        @Index(name = "idx_previews_status", columnList = "status")
})
/**
 * One attempt at running a project live: a runner pod claimed from the pool, the project's files synced into it, and
 * a Vite dev server behind the preview proxy.
 *
 * <p>Handles: which pod and namespace it runs in, the hostname and URL it is served on, who started it, its status
 * and the step or failure reason behind that, the tail of the output when a start fails, the lifecycle timestamps
 * including the last time anyone looked at it, and which service instance's bootstrap owns it and when that
 * bootstrap last proved it was still alive - CODE_REVIEW.md PRE-03, so a rolling deployment's new instance can tell
 * a still-running bootstrap apart from one truly abandoned by a crashed process. Also what kind of thing a failed
 * start died of, the project file revision the runner's files were last brought up to, and the step under way while
 * a newer one is being applied.
 *
 * <p>A row that is still creating and has no pod is waiting in line for a runner: every runner was busy when it was
 * started, and it takes the next one that comes free.
 *
 * <p>A new row per start, so a failure stays readable after a retry. The hostname is reused by every later preview of
 * the same project, so a shared link keeps working across stops and restarts, and is random so it cannot be guessed
 * from the project id.
 *
 * <p>Status moves only through the repository's conditional updates, never by saving a loaded entity: the
 * asynchronous bootstrap and a user pressing Stop race, and a plain save from whichever finished last would bring a
 * stopped preview back to life. The projectId column is a read-only duplicate of the relation, for code running
 * outside a request - the reaper - where touching the lazy relation would throw.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Preview {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    Project project;

    @Column(name = "project_id", insertable = false, updatable = false)
    Long projectId;

    String namespace;
    String podName;
    String previewUrl;

    String hostname;

    Long startedByUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    PreviewStatus status;

    @Column(length = 500)
    String detail;

    @Column(columnDefinition = "text")
    String failureLog;

    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    PreviewFailureKind failureKind;

    Long syncedRevisionId;

    @Column(length = 200)
    String syncDetail;

    Instant startedAt;
    Instant readyAt;
    Instant lastAccessedAt;
    Instant terminatedAt;

    String bootstrapOwner;
    Instant bootstrapHeartbeatAt;

    @CreationTimestamp
    Instant createdAt;

}
