# Billing

Plans, subscriptions and Stripe checkout. **Service:** account-service · **Controller:** `BillingController` (full paths below)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/plans` | — | `List<PlanResponse>` | **Public**, so the pricing page works signed out. `price` is formatted server-side (`util.MoneyFormat`, Indian digit grouping for INR). |
| `GET` | `/api/me/subscription` | — | `SubscriptionResponse` | Never a null plan: a user with no entitling subscription gets the Free plan with `isFree: true`. `syncPending: true` means a plan change reached Stripe but reading it back failed, so the fields may still show the previous state — poll again. |
| `POST` | `/api/payments/checkout` | `{ planId }` | `{ checkoutUrl }` | `400` if the caller already has a subscription (use `change-plan`). Idempotent: a repeated request for the same plan (a double click, a second tab) reuses the same Stripe Checkout Session and idempotency key. |
| `POST` | `/api/payments/portal` | — | `{ portalUrl }` | The Stripe customer portal. `400` if the caller has never checked out. |
| `POST` | `/api/payments/confirm` | `{ sessionId }` | `SubscriptionResponse` | Called by the frontend on Stripe's redirect back. It lets checkout complete locally, where Stripe can't reach a webhook, and is a safety net for a dropped webhook in production. Verifies the session was paid **and** belongs to the caller. Idempotent and safe to race the webhook. |
| `POST` | `/api/payments/change-plan` | `{ planId }` | `SubscriptionResponse` | Changes an existing subscription in place. To Free: cancels at period end. To the current plan while cancelling: resumes. To a dearer plan: charges the prorated difference now — a declined card is a `400` and leaves everything unchanged. To a cheaper plan: credits the difference to the next invoice. |
| `POST` | `/webhooks/payment` | Raw body + `Stripe-Signature` | `200` or `400` | No session and no CSRF token; authenticated by signature verification with a 300-second timestamp tolerance instead. See below. |

## Webhook handling

- A bad or missing signature, or a stale timestamp, is a `400`, so Stripe doesn't retry something that can never verify. An event type nothing handles is a `200`.
- Every delivery is claimed by Stripe's event id before its handler runs, so a redelivered event that was already processed is skipped.
- A delayed or out-of-order event is dropped rather than overwriting newer state (each subscription tracks the last event applied).
- A handler that throws leaves the event reclaimable, and the endpoint returns an error so Stripe retries.

## Test mode

The live demo runs with Stripe test keys; use card `4242 4242 4242 4242` with any future expiry and CVC. The pricing and billing pages show a notice when the frontend is built with `VITE_PAYMENTS_TEST_MODE=true`. Moving to live payments is described in [operations](../operations/stripe-live-mode.md).

## Related

- [`SUBSCRIPTION`, `PLAN`, `CHECKOUT_INTENT`, `WEBHOOK_EVENT`](../schema/account-service.md) — entitlement rules and idempotency tables.
