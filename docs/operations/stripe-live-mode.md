# Going Live with Stripe

The deployment uses Stripe test keys, and the pricing and billing pages say so (the frontend image is built with `VITE_PAYMENTS_TEST_MODE=true`).

To take real payments:

1. Create the Pro and Business products and recurring prices in Stripe's **live** mode.
2. Replace the `STRIPE_SECRET`, `STRIPE_PRICE_PRO` and `STRIPE_PRICE_BUSINESS` secrets with live values.
3. Add a live webhook endpoint at `https://<app domain>/webhooks/payment` and replace `STRIPE_WEBHOOK_SECRET` with its signing secret.
4. Remove the `VITE_PAYMENTS_TEST_MODE` build argument from the frontend image job in `ci.yml`.
5. Deploy.

The plan catalogue is keyed by Stripe price id, so on the first start with the new price ids `PlanSeeder` adds plan rows for them and leaves the old test-mode rows in place.
