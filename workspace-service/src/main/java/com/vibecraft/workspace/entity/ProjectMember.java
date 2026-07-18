package com.vibecraft.workspace.entity;

import com.vibecraft.workspace.enums.ProjectRole;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;

import java.time.Instant;

@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
@Entity
@Table(name = "project_members")
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectMember {

    @EmbeddedId
    ProjectMemberId id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @MapsId("projectId")
    @JoinColumn(name = "project_id")
    Project project;

    // No `user` relation: User lives in account-service's own database now, not this one, so it can never be a
    // JPA association here. The user id is carried entirely by `id.userId` - resolve the human-readable bits
    // (username/name) via AccountServiceClient when needed, never by joining locally.

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    ProjectRole projectRole;

    Instant invitedAt;
    Instant acceptedAt;

    // Per-member preferences: null when not pinned/starred, otherwise when it was.
    Instant pinnedAt;
    Instant starredAt;

}
