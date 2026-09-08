/**
 * Whether the deployed payment provider is in test mode, and the card that works there.
 *
 * Handles: reading the build-time `VITE_PAYMENTS_TEST_MODE` flag and the number of Stripe's standard test card, so the
 * pricing and billing pages can tell a visitor that no real money moves and which card to use.
 *
 * The flag is baked in when the bundle is built (Vite inlines `import.meta.env.VITE_*`; a static SPA has no runtime
 * env), which is why it lives in the frontend image's build args and not in a server setting. Only the literal string
 * "true" turns it on - a missing, empty or misspelt value leaves the notice off, so the failure mode is a page that
 * doesn't mention test mode, never one that wrongly claims it. It has to be removed when the app moves to live keys.
 */

export const TEST_CARD_NUMBER = "4242 4242 4242 4242";

export function isPaymentsTestMode(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === "true";
}

export const PAYMENTS_TEST_MODE = isPaymentsTestMode(import.meta.env.VITE_PAYMENTS_TEST_MODE as string | undefined);
