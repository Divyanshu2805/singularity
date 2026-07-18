package com.vibecraft.account.security;

import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * Reads the caller identity Spring Security put in the context — distinct from common-lib's internal JWT,
 * which is a separate, service-to-service concern this class has nothing to do with.
 */
@Component
public class AuthUtil {

    /** The current caller, or an AuthenticationException (401) if the request isn't signed in. */
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
