package com.vibecraft.workspace.entity;

import com.vibecraft.workspace.enums.RevisionChangeType;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * One path's change within a {@link ProjectFileRevision} - a delta entry, not a full-tree snapshot row.
 *
 * <p>Handles: the path, whether it was edited or deleted, the new content's hash in the content-addressed blob
 * bucket (null for a delete), and the path's previous content hash - the rollback data a failed or superseded
 * publish restores from. Blobs are never deleted (garbage collection is deliberately deferred), so
 * {@code previousContentHash} is always resolvable back to real bytes.
 */
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
@Entity
@Table(name = "project_file_revision_entries")
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectFileRevisionEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @Column(name = "revision_id", nullable = false)
    Long revisionId;

    @Column(nullable = false)
    String path;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    RevisionChangeType changeType;

    String contentHash;

    String previousContentHash;

    Long size;

    String contentType;
}
