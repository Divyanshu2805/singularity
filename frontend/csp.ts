/**
 * The app's Content Security Policy - the main defence that remains if some cross-site-scripting bug ever lets a
 * script into the page.
 *
 * Handles: building the policy from the origins this deployment actually uses - the API, the identity provider's
 * domain, and any origins live previews are framed from.
 *
 * With the session in an httpOnly cookie such a script still cannot steal it, and this stops it loading its payload
 * or sending data anywhere this list does not name. Injected as a meta tag at build time only: the dev server relies
 * on inline scripts and a websocket that a real policy would block. A meta policy cannot set frame-ancestors, so when
 * deployed, serve this same policy as a response header and add that directive there.
 */
export function buildContentSecurityPolicy(env: Record<string, string | undefined>): string {
  const apiOrigin = env.VITE_API_BASE_URL ? new URL(env.VITE_API_BASE_URL).origin : "";
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN ? `https://${env.VITE_FIREBASE_AUTH_DOMAIN}` : "";
  const previewOrigins = env.VITE_CSP_FRAME_ORIGINS ?? "";

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "https://apis.google.com", "https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/"],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "https://lh3.googleusercontent.com"],
    "connect-src": ["'self'", apiOrigin, "https://*.googleapis.com", "https://www.google.com/recaptcha/"],
    "frame-src": ["'self'", authDomain, "https://www.google.com/recaptcha/", "https://recaptcha.google.com/recaptcha/", previewOrigins],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };

  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.filter(Boolean).join(" ")}`)
    .join("; ");
}
