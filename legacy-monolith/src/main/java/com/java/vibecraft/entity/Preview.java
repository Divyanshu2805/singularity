package com.java.vibecraft.entity;

import com.java.vibecraft.enums.PreviewStatus;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

/**
 * One attempt at running a project live: a runner pod claimed from the pool, the project's files synced into it,
 * and a Vite dev server behind the preview proxy. A new row per start, so a failure stays readable after a retry.
 *
 * <p>Status moves only through {@code PreviewRepository}'s conditional updates (CREATING to RUNNING, and so on),
 * never by saving a loaded entity: the async bootstrap and a user pressing Stop race, and a plain save from
 * whichever finished last would bring a stopped preview back to life.
 */
@Entity
@Table(name = "previews", indexes = {
        @Index(name = "idx_previews_project_id", columnList = "project_id"),
        @Index(name = "idx_previews_status", columnList = "status")
})
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

    /**
     * The same column as {@code project}, read-only, for code running outside a request (the reaper), where touching
     * the lazy relation would throw. Only populated on rows loaded from the database, not on one just built.
     */
    @Column(name = "project_id", insertable = false, updatable = false)
    Long projectId;

    String namespace;
    String podName;
    String previewUrl;

    /**
     * The host the proxy routes on ({@code p12-x7k2m9qd4a.localhost}). Reused by every later preview of the same
     * project, so a shared link keeps working across stops and restarts - and random, so it can't be guessed
     * from the project id.
     */
    String hostname;

    /** Who started it - the plan whose preview allowance it counts against. */
    Long startedByUserId;

    // The dev DB's previews_status_check constraint lists exactly these four values: adding a status means
    // dropping that constraint first (see CLAUDE.md on enum check constraints).
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    PreviewStatus status;

    /** While CREATING, the step in progress ("Installing dependencies"); once FAILED or TERMINATED, why. */
    @Column(length = 500)
    String detail;

    /** The tail of the install/dev-server output when a start fails - the runner pod is gone by then. */
    @Column(columnDefinition = "text")
    String failureLog;

    Instant startedAt;
    Instant readyAt;
    /** The last time someone looked at this preview from the app. The proxy records direct visits in Redis. */
    Instant lastAccessedAt;
    Instant terminatedAt;

    @CreationTimestamp
    Instant createdAt;

}
