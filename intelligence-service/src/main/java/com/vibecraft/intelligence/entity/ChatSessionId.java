package com.vibecraft.intelligence.entity;

import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

import java.io.Serializable;

/**
 * The composite key of a chat session.
 *
 * <p>Handles: the project id and user id together, with equality over both - which is what makes a session findable,
 * saveable and distinct per member.
 */
@Embeddable
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
@ToString
@EqualsAndHashCode
public class ChatSessionId implements Serializable {
    Long projectId;
    Long userId;
}
