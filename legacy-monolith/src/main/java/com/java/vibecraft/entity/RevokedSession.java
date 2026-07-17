package com.java.vibecraft.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;

import java.time.Instant;

/**
 * A session cookie someone signed out of. Firebase can only revoke <em>all</em> of a user's sessions, so signing out
 * of one device is enforced here instead: the cookie stays cryptographically valid until it expires, and this row
 * is what makes it useless before then. Only the SHA-256 of the cookie is stored.
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

    /** When the cookie would have expired anyway - after that the row is dead weight and gets pruned. */
    @Column(nullable = false)
    Instant expiresAt;
}
