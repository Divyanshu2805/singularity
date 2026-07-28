package com.vibecraft.account.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;

import java.time.Instant;

/**
 * A session cookie someone signed out of.
 *
 * <p>Handles: the SHA-256 of that cookie and when it would have expired anyway, after which the row is dead weight
 * and gets pruned.
 *
 * <p>This table exists because Firebase can only revoke all of a user's sessions at once. Signing out of one device
 * is enforced here instead: the cookie stays cryptographically valid until it expires, and this row is what makes it
 * useless before then. Only the hash is stored, never the cookie.
 */
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
@Entity
@AllArgsConstructor
@NoArgsConstructor
@Builder
@Table(name = "revoked_sessions")
public class RevokedSession {

    @Id
    @Column(length = 64)
    String cookieHash;

    @Column(nullable = false)
    Instant expiresAt;
}
