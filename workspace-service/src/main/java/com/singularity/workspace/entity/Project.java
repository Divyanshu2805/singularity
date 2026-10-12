package com.singularity.workspace.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
@Entity
@AllArgsConstructor
@NoArgsConstructor
@Builder
@Table(name = "projects",
        indexes = {
                @Index(name = "idx_projects_updated_at_desc", columnList = "updated_at DESC, deleted_at"),
                @Index(name = "idx_projects_deleted_at_updated_at_desc", columnList = "deleted_at, updated_at DESC"),
                @Index(name = "idx_project_deleted_at", columnList = "deleted_at")
        }
)
/**
 * A project: the thing a user builds, and what every file, chat, preview and membership hangs off.
 *
 * <p>Handles: the name - what the app is called, one or two words when it was made from an idea - a line saying what
 * it is, whether it is public, the lifecycle timestamps, a nullable deletedAt for soft deletion, any
 * outstanding starter-template problem, the project it was forked from, and when its picture was last taken.
 *
 * <p>Soft deletion is a plain column with no automatic filter, so every query that must exclude deleted projects has
 * to say so itself. The fork reference is a plain id rather than a relation: a fork is its own project from the
 * moment it is made and must keep working if the original is later deleted.
 */
public class Project {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @Column(nullable = false)
    String name;

    /** What the app is, in at most eight words; null on a project made before there was one. */
    @Column(length = 120)
    String summary;

    @Builder.Default
    Boolean isPublic = false;

    @CreationTimestamp
    Instant createdAt;

    @UpdateTimestamp
    Instant updatedAt;

    Instant deletedAt;

    String templateInitIssue;

    Long forkedFromProjectId;

    /**
     * The project's currently-published revision (CODE_REVIEW.md AI-05) - null until the project's first
     * post-GATE-02 write, and the value a publish's optimistic-concurrency check is compared against. Not a
     * relation: {@code ProjectFileRevisionRepository}'s CAS update writes this column directly by id, and loading
     * it as an entity here would fight that single-statement compare-and-swap.
     */
    Long currentFileRevisionId;

    /** When the project's picture was last stored; null while it has none. Written by a query, never by a save. */
    @Column(insertable = false, updatable = false)
    Instant thumbnailAt;
}
