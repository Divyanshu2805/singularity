package com.vibecraft.account.entity;

import com.vibecraft.account.enums.AuthAuditEventType;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

/**
 * One security-relevant thing that happened to an account: a sign-in, a rejected one, a sign-out, a second factor
 * added. Append-only - nothing updates or deletes these rows.
 *
 * <p>{@code userId} is a plain column rather than a relation on purpose: a rejected sign-in often has no user, and
 * the trail must outlive whatever happens to the account it describes.
 */
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
@Entity
@AllArgsConstructor
@NoArgsConstructor
@Builder
@Table(name = "auth_audit_events", indexes = @Index(name = "idx_auth_audit_user_created", columnList = "userId, createdAt"))
public class AuthAuditEvent {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    Long userId;

    @Column(length = 128)
    String firebaseUid;

    // No CHECK constraint on an enum column: an unmanaged schema-evolution tool never widens one, so a new
    // value would fail every insert. See docs/schema/'s "Persisted enums" trap.
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(64)")
    AuthAuditEventType type;

    @Column(length = 64)
    String ipAddress;

    @Column(length = 255)
    String userAgent;

    @Column(length = 255)
    String detail;

    @CreationTimestamp
    Instant createdAt;
}
