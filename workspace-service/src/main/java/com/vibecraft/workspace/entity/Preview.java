package com.vibecraft.workspace.entity;

import com.vibecraft.workspace.enums.PreviewStatus;
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
 * and the step or failure reason behind that, the tail of the output when a start fails, and the lifecycle timestamps
 * including the last time anyone looked at it.
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

    Instant startedAt;
    Instant readyAt;
    Instant lastAccessedAt;
    Instant terminatedAt;

    @CreationTimestamp
    Instant createdAt;

}
