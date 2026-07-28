package com.vibecraft.workspace.entity;

import com.vibecraft.workspace.enums.ProjectRole;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;

import java.time.Instant;

/**
 * One person's membership of one project.
 *
 * <p>Handles: the composite project-and-user key, the role, when they were invited and accepted, and their own pin
 * and star markers.
 *
 * <p>There is no user relation: users live in account-service's own database, so the user id is carried entirely by
 * the key and the human-readable parts are resolved over the internal API, never by a local join.
 */
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

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    ProjectRole projectRole;

    Instant invitedAt;
    Instant acceptedAt;

    Instant pinnedAt;
    Instant starredAt;

}
