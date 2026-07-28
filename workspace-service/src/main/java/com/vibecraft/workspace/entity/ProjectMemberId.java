package com.vibecraft.workspace.entity;

import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;

/**
 * The composite key of a project membership.
 *
 * <p>Handles: the project id and user id together, with equality over both - which is what lets a membership be
 * looked up, saved and deleted by identity.
 */
@Embeddable
@Getter
@Setter
@EqualsAndHashCode
@NoArgsConstructor
@AllArgsConstructor
public class ProjectMemberId implements Serializable {
    Long projectId;
    Long userId;
}
