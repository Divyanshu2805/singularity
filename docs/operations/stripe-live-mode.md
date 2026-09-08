# Leaving Stripe test mode

The deployed app uses Stripe test keys, and the pricing and billing pages say so (`VITE_PAYMENTS_TEST_MODE=true` in the frontend image's build args in `ci.yml`). To go live: replace the `STRIPE_*` secrets with live values, point the webhook at the live endpoint, and delete that build-arg line. The plan catalogue is keyed by Stripe price id, so on the first boot with new price ids `PlanSeeder` adds plan rows for them and leaves the old rows in place.
