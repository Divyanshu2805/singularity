# Phase 1 — Account Service (not started)

Planned moves (see the migration plan for the full design): `User`, `Plan`, `Subscription`, `PasswordResetToken`, `AuthAuditEvent`, `RevokedSession` and their repositories/services/mappers, `PaymentProcessor`/`StripePaymentProcessor`, `BillingController`, the non-Firebase parts of `AuthController`/`LegacyAuthController` → `account-service`. Firebase verification and session-cookie handling → `gateway-service`. This section gets filled in with real file-level detail once that phase starts.
