package com.singularity.intelligence.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

/**
 * One term of a person's glossary for a project, with the definition written for them.
 *
 * <p>Handles: the term as the person met it, the lower-cased key it is looked up by, and the definition - a plain
 * meaning, an everyday comparison and where the term shows up in their own code.
 *
 * <p>Private to its reader: unique on project, user and key, and every query filters on all of them. The definition
 * is written once, when the term is first pressed or looked up, and kept as it was; asking for the same term again
 * returns the kept text without calling the model. The project and user are plain columns, not relations: they live
 * in other services' databases.
 */
@Entity
@Table(name = "glossary_entries")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@FieldDefaults(level = AccessLevel.PRIVATE)
public class GlossaryEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @Column(name = "project_id", nullable = false)
    Long projectId;

    @Column(name = "user_id", nullable = false)
    Long userId;

    @Column(nullable = false, length = 80)
    String term;

    @Column(nullable = false, length = 80)
    String termKey;

    @Column(nullable = false, columnDefinition = "text")
    String definition;

    @CreationTimestamp
    Instant createdAt;
}
