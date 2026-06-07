package com.java.vibecraft.entity;

import com.java.vibecraft.enums.ChatEventType;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;

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

    /**
     * An explicit {@code columnDefinition} stops Hibernate generating a {@code CHECK type IN (...)} constraint
     * listing today's enum values. Under {@code ddl-auto: update} Hibernate creates such a constraint once and
     * then never alters it, so adding a value to {@link ChatEventType} left every insert of the new value
     * failing against the old constraint - and because events are saved as one batch, a single new-value row
     * rejected the whole conversation, losing the entire chat history for that turn while the generated files
     * had already been written. Found 2026-09-15 when {@code TODO} was added for the build checklist.
     */
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

    /**
     * {@code FILE_EDIT} only: the file as it was just before this turn saved over it - empty for a file the turn
     * created. It's what the editor's diff toggle compares against, and storage keeps only a file's current version,
     * so without this the last turn's diff lived only in the browser and was gone after signing out. Null for events
     * saved before this existed, or when the old version couldn't be read.
     */
    @Column(columnDefinition = "text")
    String previousContent;

}
