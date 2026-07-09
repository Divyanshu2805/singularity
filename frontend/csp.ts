/**
 * The app's Content Security Policy - the main defence that remains if some XSS bug ever lets a script into the page.
 * With the session in an httpOnly cookie such a script still can't steal it, but CSP stops it loading its payload or
 * sending data anywhere this list doesn't name.
 *
 * <p>Injected as a `<meta>` tag at **build time only**: the dev server relies on inline scripts (React refresh) and a
 * websocket (HMR) that a real policy would block. A meta CSP can't set `frame-ancestors`; when the app is deployed,
 * serve this same policy as a response header from the host/CDN and add `frame-ancestors 'none'` there.
 */
export function buildContentSecurityPolicy(env: Record<string, string | undefined>): string {
  const apiOrigin = env.VITE_API_BASE_URL ? new URL(env.VITE_API_BASE_URL).origin : "";
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN ? `https://${env.VITE_FIREBASE_AUTH_DOMAIN}` : "";
  // Where live project previews are served from, space-separated - they load in an iframe.
  const previewOrigins = env.VITE_CSP_FRAME_ORIGINS ?? "";

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // apis.google.com: the Google sign-in popup helper. google.com/gstatic.com recaptcha: Identity Platform's bot checks.
    "script-src": ["'self'", "https://apis.google.com", "https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/"],
    // 'unsafe-inline' for styles only: Radix and the resizable panels set inline style attributes.
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "https://lh3.googleusercontent.com"],
    // Firebase Auth's REST endpoints (identitytoolkit, securetoken) all live under googleapis.com.
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
