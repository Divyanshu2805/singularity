package com.vibecraft.workspace.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

/**
 * One file in a project: its metadata here, its bytes in object storage.
 *
 * <p>Handles: the canonical path, the storage object key, the size and content type, and when it was created and last
 * changed.
 *
 * <p>There is deliberately no createdBy or updatedBy: nothing reads them, and they would be another user relation
 * that cannot resolve now that users live in account-service's own database.
 */
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
@Entity
@Table(name = "project_files")
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectFile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    Project project;

    @Column(nullable = false)
    String path;

    String minioObjectKey;

    Long size;

    String type;

    @CreationTimestamp
    Instant createdAt;

    @UpdateTimestamp
    Instant updatedAt;

}
