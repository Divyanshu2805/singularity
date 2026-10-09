package com.singularity.workspace.entity;

import com.singularity.workspace.enums.ProjectRole;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;

import java.time.Instant;

/**
 * An invitation to a project that nobody has accepted yet.
 *
 * <p>Handles: the project, the invited email address in lower case, the role it offers, who sent it and when.
 *
 * <p>It is keyed by address and not by user, on purpose: a row is written the same way whether or not an account
 * exists for that address, so sending an invitation never says which addresses are registered. It grants nothing by
 * itself - no permission query reads this table - and it is deleted when it is accepted, declined or withdrawn.
 */
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
@Entity
@Table(name = "project_invites")
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectInvite {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id")
    Project project;

    @Column(nullable = false, length = 320)
    String email;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    ProjectRole projectRole;

    @Column(nullable = false)
    Long invitedBy;

    @Column(nullable = false)
    Instant invitedAt;
}
