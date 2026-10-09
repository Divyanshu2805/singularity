package com.singularity.workspace.entity;

import com.singularity.workspace.enums.PublishBuildStatus;
import com.singularity.workspace.enums.PublishFailureKind;
import com.singularity.workspace.enums.PublishStatus;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

/**
 * A project's published app: the link it is served at, the build that is live there and the build being made.
 *
 * <p>Handles: the link's name (slug), whether anything is being served, which revision the live build was made from
 * and where it is stored, who published it and when, the build under way or the last one that failed - its step, its
 * runner pod, its heartbeat, and for a failure its kind, one plain sentence and the tail of its output - and the one
 * old build prefix waiting to be deleted.
 *
 * <p>One row per project, kept when the app is unpublished so the link stays the project's. Live and build are
 * separate groups of columns on purpose: an update that fails must leave the live app exactly as it was. Every change
 * to the build columns goes through the repository's conditional updates, matching the build number, so a build that
 * was cancelled or taken over cannot write over the row that replaced it. The projectId column is a read-only
 * duplicate of the relation, for code running outside a request where the lazy relation would throw.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@FieldDefaults(level = AccessLevel.PRIVATE)
@Entity
@Table(name = "published_apps", indexes = {
        @Index(name = "idx_published_apps_status", columnList = "status"),
        @Index(name = "idx_published_apps_build_status", columnList = "build_status")
})
public class PublishedApp {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false, unique = true)
    Project project;

    @Column(name = "project_id", insertable = false, updatable = false)
    Long projectId;

    @Column(nullable = false, unique = true, length = 63)
    String slug;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    PublishStatus status;

    @Column(length = 100)
    String livePrefix;

    Long liveRevisionId;
    Integer liveFileCount;
    Long liveBytes;
    Long publishedByUserId;
    Instant publishedAt;

    @Column(nullable = false)
    @Builder.Default
    long buildNumber = 0;

    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    PublishBuildStatus buildStatus;

    Long buildRevisionId;

    @Column(length = 200)
    String buildDetail;

    String buildPodName;
    Long buildStartedByUserId;
    Instant buildStartedAt;
    Instant buildHeartbeatAt;
    String buildOwner;

    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    PublishFailureKind failureKind;

    @Column(length = 500)
    String failureDetail;

    @Column(columnDefinition = "text")
    String failureLog;

    @Column(length = 100)
    String retiredPrefix;

    Instant retiredAt;

    @CreationTimestamp
    Instant createdAt;

    @UpdateTimestamp
    Instant updatedAt;
}
