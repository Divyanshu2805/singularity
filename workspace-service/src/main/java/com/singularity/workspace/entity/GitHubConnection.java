package com.singularity.workspace.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

import java.time.Instant;

/**
 * One person's connection to their GitHub account.
 *
 * <p>Handles: who it belongs to, which GitHub account it is, the access token GitHub issued - encrypted - the scopes
 * GitHub says it carries, and when it was made.
 *
 * <p>Keyed by the user's id, which this service assigns nothing to: one person has one connection, and connecting
 * again replaces it. The token is only ever read by the code that calls GitHub; no response carries it, in any form.
 * The row is deleted on disconnect, and when GitHub answers that the token is no longer good.
 */
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
@Entity
@Table(name = "github_connections")
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GitHubConnection {

    @Id
    Long userId;

    @Column(nullable = false)
    Long githubUserId;

    @Column(nullable = false, length = 100)
    String login;

    @Column(nullable = false, columnDefinition = "TEXT")
    String accessTokenCipher;

    @Column(length = 255)
    String scopes;

    @Column(nullable = false)
    Instant connectedAt;
}
