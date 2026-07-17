package com.vibecraft.account.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

/**
 * One emailed "reset your password" link. Only the SHA-256 of the token is stored, so someone reading this table
 * can't use a row to take over an account - the token itself exists only in the email. Single use: a successful
 * reset deletes every token the user has, and so does requesting a new one.
 */
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
@Entity
@AllArgsConstructor
@NoArgsConstructor
@Builder
@Table(name = "password_reset_tokens")
public class PasswordResetToken {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    User user;

    @Column(nullable = false, unique = true, length = 64)
    String tokenHash;

    @Column(nullable = false)
    Instant expiresAt;

    @CreationTimestamp
    Instant createdAt;
}
