package com.vibecraft.common.security;

import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * Reads the signed-in caller out of Spring Security's context.
 *
 * <p>Handles: the two lookups every controller and service uses - the whole UserPrincipal, or just its user id - and
 * raising a 401 when the request is not signed in at all.
 *
 * <p>A machine caller authenticated by the internal-service secret is not a UserPrincipal, so both methods throw for
 * it. That is why a permission check belongs on the controller rather than on a service method an internal endpoint
 * also calls.
 */
@Component
public class AuthUtil {

    public UserPrincipal getCurrentPrincipal() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof UserPrincipal userPrincipal)) {
            throw new AuthenticationCredentialsNotFoundException("You need to sign in to do that.");
        }
        return userPrincipal;
    }

    public Long getCurrentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof UserPrincipal userPrincipal)) {
            throw new AuthenticationCredentialsNotFoundException("No JWT Found");
        }
        return userPrincipal.userId();
    }
}
