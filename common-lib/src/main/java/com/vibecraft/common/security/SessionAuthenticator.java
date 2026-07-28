package com.vibecraft.common.security;

import java.util.Optional;

/**
 * Turns a session cookie into the signed-in caller, or into nothing if it no longer works.
 *
 * <p>Handles: the contract SessionAuthFilter depends on. Two implementations exist because the two kinds of service
 * resolve a user differently - account-service owns the User and RevokedSession tables and reads them directly, while
 * every other service has neither and asks account-service over its internal API. Both accept the same cookie, which
 * is what lets one sign-in authenticate a request to any service.
 *
 * <p>An empty result means the cookie is expired, revoked or its user is gone. Throwing is reserved for not being
 * able to reach the identity provider to decide: it fails closed rather than letting an unverifiable cookie through.
 */
public interface SessionAuthenticator {

    Optional<UserPrincipal> authenticate(String sessionCookie);
}
