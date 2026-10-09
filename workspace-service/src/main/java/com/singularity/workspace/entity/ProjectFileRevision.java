package com.singularity.workspace.entity;

import com.singularity.workspace.enums.RevisionSource;
import com.singularity.workspace.enums.RevisionStatus;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

/**
 * One attempted change set: the durable manifest a publish records before touching storage.
 *
 * <p>Handles: which project it belongs to, the revision it was published against (the optimistic-concurrency base),
 * its lifecycle status, who/what produced it, and - on failure - why. {@code parentRevisionId} is a plain id rather
 * than a relation: walking a project's whole history is a recursive query, not an object graph Hibernate should try
 * to load eagerly.
 */
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
@Entity
@Table(name = "project_file_revisions")
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectFileRevision {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @Column(name = "project_id", nullable = false)
    Long projectId;

    Long parentRevisionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    RevisionStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    RevisionSource source;

    @Column(nullable = false)
    Long createdByUserId;

    String failureDetail;

    @CreationTimestamp
    Instant createdAt;

    Instant appliedAt;

    /** On a revision made by going back: the revision that was chosen. Null on every other kind. */
    Long restoredRevisionId;

    /** On such a revision: whether the project was put back to just before the chosen revision rather than just after. */
    Boolean restoredBefore;
}
