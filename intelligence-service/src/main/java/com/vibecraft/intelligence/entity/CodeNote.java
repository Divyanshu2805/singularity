package com.vibecraft.intelligence.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

@Entity
@Table(name = "code_notes", indexes = {
        @Index(name = "idx_code_notes_project_user", columnList = "project_id, user_id")
})
/**
 * One exchange of a project's code notes - a question and the answer it got - belonging to whoever asked it.
 *
 * <p>Handles: the question and answer, and the selected block they were about, stored flat as the file, the code and
 * its line range.
 *
 * <p>Private to its author: the row carries both the project and the user, and every query filters on both, so two
 * people looking at the same project keep separate threads. An exchange rather than a message per row, because the
 * transcript is always a question followed by its answer and deleting one note should take the pair away together
 * rather than leave an answer with no question.
 *
 * <p>The project and user are plain columns, not relations: they live in other services' databases.
 */
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

    @Column(name = "project_id", nullable = false)
    Long projectId;

    @Column(name = "user_id", nullable = false)
    Long userId;

    @Column(nullable = false, columnDefinition = "text")
    String question;

    @Column(nullable = false, columnDefinition = "text")
    String answer;

    String selectionPath;

    @Column(columnDefinition = "text")
    String selectionCode;

    Integer selectionStartLine;

    Integer selectionEndLine;

    @CreationTimestamp
    Instant createdAt;
}
