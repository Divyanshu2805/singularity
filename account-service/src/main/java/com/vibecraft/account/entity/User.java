package com.vibecraft.account.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

/**
 * An account on this platform.
 *
 * <p>Handles: the email used as the username, the display name, the Firebase uid, the Stripe customer id once they
 * have one, and a nullable deletedAt for soft deletion.
 *
 * <p>The Firebase uid is the identity every sign-in method resolves to, and accounts are matched on it rather than on
 * email: an address can change hands, the uid cannot. Soft deletion is a plain column with no automatic filter, so
 * every query that must exclude deleted users has to say so itself. There is no password column - Firebase is the
 * only sign-in method.
 */
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
@Entity
@AllArgsConstructor
@NoArgsConstructor
@Builder
@Table(name = "users")
public class User {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @Column(nullable = false, unique = true)
    String username;

    String name;

    @Column(unique = true)
    String firebaseUid;

    @Column(unique = true)
    String stripeCustomerId;

    @CreationTimestamp
    Instant createdAt;

    @UpdateTimestamp
    Instant updatedAt;

    Instant deletedAt;
}
