package com.vibecraft.intelligence.entity;

import com.vibecraft.intelligence.enums.ChatEventType;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * One step of an assistant turn: a thought, a message, a checklist item, a file written or deleted, a lesson, or a
 * tool log.
 *
 * <p>Handles: its type and order within the turn, its content, the file it concerns, any metadata (a lesson's concept
 * name, a tool's arguments), and for a file edit the version that file had immediately before this turn saved over
 * it.
 *
 * <p>The previous version is stored because object storage keeps only a file's current version: without it, the last
 * turn's diff lived only in the browser and was gone after signing out.
 *
 * <p>The type column is declared with an explicit column definition so Hibernate does not generate a check constraint
 * listing today's enum values. Such a constraint is created once and never widened, so adding an event type left
 * every insert of the new value failing - and because a turn's events are saved as one batch, a single rejected row
 * took the whole conversation with it while the generated files had already been written.
 */
@Entity
@Table(name = "chat_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ChatEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(nullable = false)
    ChatMessage chatMessage;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(255)")
    ChatEventType type;

    @Column(nullable = false)
    Integer sequenceOrder;

    @Column(columnDefinition = "text")
    String content;

    String filePath;

    @Column(columnDefinition = "text")
    String metadata;

    @Column(columnDefinition = "text")
    String previousContent;

}
