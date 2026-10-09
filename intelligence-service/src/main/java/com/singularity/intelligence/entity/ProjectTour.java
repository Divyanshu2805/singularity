package com.singularity.intelligence.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

/**
 * The tour of one project, "how your app fits together", as written for one person.
 *
 * <p>Handles: the finished text of the tour and when it was first and last written.
 *
 * <p>Private to the person it was written for: it carries both the project and the user and is unique on the pair,
 * since it is written for the reader's own level and costs that person's allowance. It is kept until they write it
 * again, which replaces it - the project moves on, a tour does not, so writing it again is the person's choice and
 * never automatic. The project and user are plain columns, not relations: they live in other services' databases.
 */
@Entity
@Table(name = "project_tours")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ProjectTour {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @Column(name = "project_id", nullable = false)
    Long projectId;

    @Column(name = "user_id", nullable = false)
    Long userId;

    @Column(nullable = false, columnDefinition = "text")
    String content;

    @CreationTimestamp
    Instant createdAt;

    @UpdateTimestamp
    Instant updatedAt;
}
