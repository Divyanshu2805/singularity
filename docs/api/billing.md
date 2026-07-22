# Billing

## `BillingController` (no path prefix — full paths on each method)

*Owner: `account-service`.*

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/api/plans` | — | `List<PlanResponse>` | **Public**, no session needed — the pricing page works signed out. `price` is preformatted server-side (`util.MoneyFormat`, Indian digit grouping for INR). |
| GET | `/api/me/subscription` | — | `SubscriptionResponse` | Never a null plan — no subscription returns the seeded Free plan with `isFree: true`. |
| POST | `/api/payments/checkout` | `{ planId }` | `{ checkoutUrl }` | 400 if the caller already has a subscription (use `change-plan` instead). |
| POST | `/api/payments/portal` | — | `{ portalUrl }` | 400 if the caller has never checked out. |
| POST | `/api/payments/confirm` | `{ sessionId }` | `SubscriptionResponse` | Called by the frontend on Stripe's redirect back — Stripe can't reach `localhost` webhooks in dev, so this is both a local-dev necessity and a safety net for a dropped webhook in production. Verifies the session was paid **and** its `user_id` metadata matches the caller. Idempotent, safe to race the webhook. |
| POST | `/api/payments/change-plan` | `{ planId }` | `SubscriptionResponse` | Changes an existing subscription in place — to Free cancels at period end; to the current plan while cancelling, resumes; a dearer plan charges the prorated difference now (a declined card leaves the plan unchanged, 400); a cheaper plan credits the difference to the next invoice. |
| POST | `/webhooks/payment` | raw body + `Stripe-Signature` | 200, or 400 | No session, no CSRF (it can carry neither) — signature-verified instead, with a 300 s timestamp tolerance. A bad or missing signature, or a stale timestamp, is 400 so Stripe doesn't retry something that can never verify; an event type nothing handles is a 200. |
