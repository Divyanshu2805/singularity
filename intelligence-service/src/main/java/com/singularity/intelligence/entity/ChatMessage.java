package com.singularity.intelligence.entity;

import com.singularity.intelligence.enums.MessageRole;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.List;

/**
 * One turn of the build chat - a user's message, or the assistant's reply to it.
 *
 * <p>Handles: which session it belongs to, the role, the tokens it cost, when it happened, whether it was asked for in
 * teaching mode, and the ordered events that make up an assistant turn.
 *
 * <p>An assistant row carries no text content of its own: its events are the record of what it did.
 *
 * <p>Teaching mode is recorded on the reply because it belongs to the turn. It used to be a switch in the browser
 * alone, so turning it on offered a lesson on every step of every earlier turn and a reload forgot which turns had
 * been taught. Only a reply with the flag set can have lessons written about its steps.
 *
 * <p>Such a reply also keeps its overview - the big picture of what the turn built, shown before any step's lesson.
 * It is written once, the first time it is shown, and kept here for the same reason a step's lesson is kept on its
 * file edit.
 *
 * <p>A reply whose files were saved records the revision they were published as. The revision belongs to
 * workspace-service, so it is a plain id and no foreign key; it is what lets the chat undo exactly this turn. It is
 * null on a turn that wrote nothing and on turns saved before it was recorded.
 */
@Entity
@Table(name = "chat_messages")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumns({
            @JoinColumn(name = "project_id", nullable = false),
            @JoinColumn(name = "user_id", nullable = false)
    })
    ChatSession chatSession;

    @Column(columnDefinition = "text")
    String content;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    MessageRole role;

    Integer tokensUsed;

    @Column(nullable = false)
    boolean teaching;

    @Column(columnDefinition = "text")
    String overview;

    Long revisionId;

    @CreationTimestamp
    Instant createdAt;

    @OneToMany(mappedBy = "chatMessage", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @OrderBy("sequenceOrder ASC")
    List<ChatEvent> events;
}
