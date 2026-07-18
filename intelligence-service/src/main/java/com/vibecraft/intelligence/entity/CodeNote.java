package com.vibecraft.intelligence.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

/**
 * One exchange of a project's code notes - a question and the answer it got - belonging to the person who
 * asked it.
 *
 * <p><b>Private to its author.</b> The row carries both the project and the user, and every query filters on
 * both, so two people looking at the same project keep separate threads. This is the same rule the project
 * chat follows through {@link ChatSession}'s composite key; code notes just don't need a session row of their
 * own, since there is nothing to hang off one.
 *
 * <p>An exchange rather than a message per row: the transcript is always a question followed by its answer,
 * and deleting one note is meant to take the pair away together rather than leave an answer with no question.
 * The selected block, when there was one, is stored flat beside them - it belongs to the question that
 * introduced it.
 */
@Entity
@Table(name = "code_notes", indexes = {
        @Index(name = "idx_code_notes_project_user", columnList = "project_id, user_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@FieldDefaults(level = AccessLevel.PRIVATE)
public class CodeNote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    // Plain columns, not relations: Project lives in workspace-service's database, User in account-service's.
    @Column(name = "project_id", nullable = false)
    Long projectId;

    @Column(name = "user_id", nullable = false)
    Long userId;

    @Column(nullable = false, columnDefinition = "text")
    String question;

    @Column(nullable = false, columnDefinition = "text")
    String answer;

    /** The file the quoted block came from, or null for a question about the project as a whole. */
    String selectionPath;

    @Column(columnDefinition = "text")
    String selectionCode;

    Integer selectionStartLine;

    Integer selectionEndLine;

    @CreationTimestamp
    Instant createdAt;
}
