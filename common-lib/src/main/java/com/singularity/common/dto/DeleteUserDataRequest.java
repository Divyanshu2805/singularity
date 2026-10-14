package com.singularity.common.dto;

/**
 * What account-service tells workspace-service when an account is being deleted.
 *
 * <p>Handles: carrying the address the account signed in with to POST /internal/v1/users/{userId}/delete-data, so
 * the invitations sent to that address - which are held by address, not by user - are deleted with everything else.
 *
 * <p>It travels in a body and not the query string so the address is never written to an access log. It is the one
 * way an address reaches workspace-service from account-service, and it goes the safe direction: account-service
 * names the account it is deleting; nothing asks whether an address has an account.
 */
public record DeleteUserDataRequest(String email) {
}
