package com.vibecraft.intelligence.entity;

import com.vibecraft.intelligence.enums.MessageRole;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.List;

/**
 * One turn of the build chat - a user's message, or the assistant's reply to it.
 *
 * <p>Handles: which session it belongs to, the role, the tokens it cost, when it happened, and the ordered events
 * that make up an assistant turn.
 *
 * <p>An assistant row carries no text content of its own: its events are the record of what it did.
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

    @CreationTimestamp
    Instant createdAt;

    @OneToMany(mappedBy = "chatMessage", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @OrderBy("sequenceOrder ASC")
    List<ChatEvent> events;
}
