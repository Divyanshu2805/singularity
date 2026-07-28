/**
 * The client half of the backend's CSRF protection.
 *
 * Handles: knowing which methods need a token, reading the readable token cookie, and priming it once before the
 * first write - with concurrent callers sharing one request rather than each making their own.
 *
 * The session is an httpOnly cookie and a browser attaches cookies to any request, including one a hostile page
 * triggers, so every state-changing request must also carry the cookie's value in a header. Another site can make the
 * browser send our cookies but cannot read them, so it cannot produce the header.
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
