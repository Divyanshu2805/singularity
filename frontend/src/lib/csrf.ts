/**
 * The client half of the backend's CSRF protection (Spring Security's `csrf().spa()`).
 *
 * <p>The session is an httpOnly cookie, and a browser attaches cookies to any request - including one a hostile page
 * triggers. So every state-changing request must also carry the value of the readable `XSRF-TOKEN` cookie in an
 * `X-XSRF-TOKEN` header. Another site can make the browser *send* our cookies but can't *read* them, so it can't
 * produce the header.
 */

export const CSRF_COOKIE = "XSRF-TOKEN";
export const CSRF_HEADER = "X-XSRF-TOKEN";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

export const needsCsrf = (method: string | undefined) => !SAFE_METHODS.has((method ?? "GET").toUpperCase());

export function readCsrfToken(cookieString = document.cookie): string | null {
  for (const part of cookieString.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === CSRF_COOKIE) {
      const value = rest.join("=");
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

let priming: Promise<void> | null = null;

/** Makes sure the token cookie exists before the first write. Concurrent callers share one request. */
export function ensureCsrfToken(baseUrl: string, force = false): Promise<void> {
  if (!force && readCsrfToken()) return Promise.resolve();
  if (!priming) {
    priming = fetch(`${baseUrl}/api/auth/csrf`, { credentials: "same-origin" })
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        priming = null;
      });
  }
  return priming;
}

/** The header to attach, or none if there's no token yet. */
export function csrfHeaders(): Record<string, string> {
  const token = readCsrfToken();
  return token ? { [CSRF_HEADER]: token } : {};
}
