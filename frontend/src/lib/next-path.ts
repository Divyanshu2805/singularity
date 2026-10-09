/**
 * Where to send someone after they sign in, when they came from a page that asked them to.
 *
 * Handles: reading the {@code next} address off the sign-in page's URL and accepting it only if it is one of this app's own
 * pages that a person might have been sent from - a shared app's page or their projects - and building the sign-in address
 * that carries one.
 *
 * An allowlist, not a check for "starts with a slash": a redirect target taken from a URL is the classic open redirect, and
 * "//evil.example" and "/\evil.example" both start with one. Anything that is not exactly one of the shapes below is dropped
 * and the person lands on their projects as usual.
 */
const ALLOWED = [/^\/p\/[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, /^\/projects$/, /^\/projects\/\d+$/];

export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return ALLOWED.some((shape) => shape.test(raw)) ? raw : null;
}

export const loginWithNext = (path: string, mode: "login" | "signup" = "login") =>
  `/${mode}?next=${encodeURIComponent(path)}`;
