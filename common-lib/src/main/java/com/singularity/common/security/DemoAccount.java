package com.singularity.common.security;

import com.singularity.common.error.ForbiddenException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * The shared public demo account: one sign-in anyone can use to look around without making an account.
 *
 * <p>Handles: telling whether a caller is that account, by its Firebase uid, and refusing the actions that would spoil
 * it for the next visitor or reach outside the app - deleting it, signing every device out, billing, connecting
 * GitHub, publishing at a public link and inviting people.
 *
 * <p>Its address and password are in the README on purpose. It is matched on its Firebase uid, which is fixed
 * ({@code demo.firebase-uid}) and the same in every service, so no service has to ask another who it is. What the
 * browser changes with Firebase directly - its password, address, name or a second factor - cannot be refused here;
 * account-service's daily reset makes the Firebase user again from nothing, which undoes all of them
 * (DemoAccountReset).
 *
 * <p>A refusal belongs on the browser-facing controller, as every user-permission guard does: the internal API runs as
 * a machine principal, which is never the demo account.
 */
public class DemoAccount {

    static final String REFUSAL = "This is the shared demo account, so this is turned off for it. Make an account of "
            + "your own to use it.";

    private final String firebaseUid;

    public DemoAccount(String firebaseUid) {
        this.firebaseUid = firebaseUid;
    }

    public String firebaseUid() {
        return firebaseUid;
    }

    public boolean is(UserPrincipal principal) {
        return principal != null && isUid(principal.firebaseUid());
    }

    public boolean isUid(String uid) {
        return firebaseUid.equals(uid);
    }

    public boolean isCurrent() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.getPrincipal() instanceof UserPrincipal principal && is(principal);
    }

    public void refuseCurrent() {
        if (isCurrent()) {
            throw new ForbiddenException(REFUSAL);
        }
    }
}
