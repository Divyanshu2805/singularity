import { Preview, PreviewLogs, ActiveGeneration, AuthSecurityEvent, AuthSecurityEventType, SessionResponse, ChatMessage, ClarifyingQuestion, CodeNote, CodeSearchResponse, CodeSelection, FileNode, Plan, QuotaDetails, Subscription, UsageEventPage, UsageInsights, UsageRange, UsageToday, IdeaAnswer, ProjectSummaryResponse, ProjectResponse, ProjectMember, ProjectRole } from "./types";
import { createSseParser } from "./sse";
import { CSRF_HEADER, ensureCsrfToken, needsCsrf, readCsrfToken } from "./csrf";
import { clearSignedInState, signOutRedirect } from "./session";

// Relative by default: in dev, Vite proxies /api to the backend (see vite.config.ts).
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const SERVER_UNREACHABLE = "Can't reach the VibeCraft server. Make sure the backend is running on port 8080.";

const rawFetch = (input: string, init?: RequestInit) =>
  // A network failure (backend or dev server down) would otherwise surface as a vague "Failed to fetch".
  fetch(input, { credentials: "same-origin", ...init }).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(SERVER_UNREACHABLE);
  });

const withCsrfHeader = (init: RequestInit | undefined): RequestInit => {
  const headers = new Headers(init?.headers);
  const token = readCsrfToken();
  if (token) headers.set(CSRF_HEADER, token);
  return { ...init, headers };
};

/**
 * Every API call goes through here. The session travels as an httpOnly cookie, so a write also has to carry the
 * CSRF token (see `csrf.ts`) - fetched first if this browser doesn't have one yet, and re-fetched once if the
 * server rejects it, which is what a token that went stale looks like.
 */
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!needsCsrf(init?.method)) return rawFetch(input, init);

  await ensureCsrfToken(BASE_URL);
  const response = await rawFetch(input, withCsrfHeader(init));
  if (response.status !== 403) return response;

  const isCsrfRejection = await response
    .clone()
    .json()
    .then((body) => typeof body?.message === "string" && /couldn't be verified/i.test(body.message))
    .catch(() => false);
  if (!isCsrfRejection) return response;

  await ensureCsrfToken(BASE_URL, true);
  return rawFetch(input, withCsrfHeader(init));
}

/** Legacy (pre-Firebase) Bearer token. Firebase sign-ins never put a credential in page-readable storage. */
export const getAuthToken = () => localStorage.getItem("auth_token");

/**
 * The session cookie is httpOnly, so this page can't see it. What it keeps instead is when that session ends - a
 * routing hint only ("show the dashboard, or go straight to sign-in?"), never a credential. If the server has
 * revoked the session sooner, the first request answers 401 and `endSession` takes over.
 */
const SESSION_HINT_KEY = "session_expires_at";

const hasSessionHint = () => {
  const expiresAt = Date.parse(localStorage.getItem(SESSION_HINT_KEY) ?? "");
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
};

/**
 * The same person got a fresh session cookie (after changing their password or second factor): update the hint, keep
 * everything else - unlike `startSession`, there's no previous account's state to throw away.
 */
export const renewSession = (session: SessionResponse) => {
  localStorage.setItem(SESSION_HINT_KEY, session.expiresAt);
  setUserInfo(session.user);
};

/** Starts a Firebase-backed session on this page, once the backend has set the cookie. */
export const startSession = (session: SessionResponse) => {
  clearSignedInState();
  localStorage.removeItem("auth_token");
  localStorage.setItem(SESSION_HINT_KEY, session.expiresAt);
  setUserInfo(session.user);
};

export const removeAuthToken = () => localStorage.removeItem("auth_token");

// The backend rejects an expired or malformed JWT with 401, so treat those as signed out up front.
const isTokenUsable = (token: string) => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp !== "number" || payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
};

export const isAuthenticated = () => {
  if (hasSessionHint() && getUserInfo()) return true;
  const token = getAuthToken();
  return !!token && isTokenUsable(token);
};

/** Where to send someone who isn't signed in - flags the case where they were, but it lapsed. */
export const loginRedirectPath = () =>
  getAuthToken() || localStorage.getItem(SESSION_HINT_KEY) ? "/login?expired=1" : "/login";

const getAuthHeaders = (): HeadersInit => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// User info storage
export const setUserInfo = (user: { id: number; username: string; name: string }) => {
  localStorage.setItem("user_info", JSON.stringify(user));
};

export const getUserInfo = (): { id: number; username: string; name: string } | null => {
  const userInfo = localStorage.getItem("user_info");
  return userInfo ? JSON.parse(userInfo) : null;
};

export const removeUserInfo = () => localStorage.removeItem("user_info");

// LocalStorage keys
export const OPEN_TABS_KEY = "open_tabs";
export const ACTIVE_TAB_KEY = "active_tab";

/**
 * Ends the signed-in session: forgets the token, and forgets everything this page was holding on that
 * person's behalf (see `session.ts` - the stores' own caches, `sessionStorage`, the open-tabs keys).
 *
 * <p>The redirect is a **full document load, never a router navigation**. Module-level state outlives a route
 * change, so signing out with `navigate("/login")` used to carry the previous account's code notes and chat
 * transcript straight into whoever signed in next on the same browser.
 */
export const signOut = (to = "/login") => {
  // Tells the server to revoke this session cookie - this page can't delete it, it's httpOnly. keepalive lets the
  // request finish although the page is about to unload, which is also why the CSRF header is read synchronously.
  const csrfToken = readCsrfToken();
  fetch(`${BASE_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: csrfToken ? { [CSRF_HEADER]: csrfToken } : {},
  }).catch(() => undefined);

  localStorage.removeItem(SESSION_HINT_KEY);
  removeAuthToken();
  removeUserInfo();
  clearSignedInState();
  if (!window.location.pathname.startsWith("/login")) {
    signOutRedirect(to);
  }
};

/** A token the backend rejected - same teardown, but says the session lapsed rather than that they left. */
const endSession = () => signOut("/login?expired=1");

/**
 * A failed request, carrying enough of the response to act on rather than only to print.
 *
 * <p>Every error used to collapse to a bare `Error(message)`, which is fine for a toast and useless for
 * anything that has to *behave* differently: a 402 means "you're out of quota, offer an upgrade", and telling
 * it apart from a network failure by matching on English prose would break the first time the wording changed.
 */
export class ApiRequestError extends Error {
  readonly status: number;
  /** Present on a 402 only - the limit, what's been used, and when it refills. */
  readonly quota?: QuotaDetails;

  constructor(message: string, status: number, quota?: QuotaDetails) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.quota = quota;
  }
}

/** True when a request failed because the caller is out of quota, whatever the wording says. */
export const isQuotaError = (error: unknown): error is ApiRequestError =>
  error instanceof ApiRequestError && error.status === 402;

/** Throws with the backend's ApiError message (not a generic string), and signs out on a rejected token. */
async function ensureOk(response: Response, fallbackMessage: string): Promise<Response> {
  if (response.ok) return response;
  if (response.status === 401 && isAuthenticated()) endSession();

  let message = fallbackMessage;
  let quota: QuotaDetails | undefined;
  try {
    const body = await response.json();
    if (typeof body?.message === "string" && body.message) message = body.message;
    if (body?.quota && typeof body.quota?.reason === "string") quota = body.quota as QuotaDetails;
  } catch {
    // Not an ApiError body - a bare 5xx here means the dev proxy couldn't reach the backend.
    if (response.status >= 500) message = SERVER_UNREACHABLE;
  }
  throw new ApiRequestError(message, response.status, quota);
}

// API response format for files endpoint
interface FilesApiResponse {
  files: { path: string }[];
}

// Convert flat file paths to nested tree structure
export function buildFileTree(paths: string[]): FileNode[] {
  const root: FileNode[] = [];
  const nodeMap = new Map<string, FileNode>();

  // Sort paths to ensure directories come before their children
  const sortedPaths = [...paths].sort((a, b) => a.localeCompare(b));

  for (const path of sortedPaths) {
    const parts = path.split("/");
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      // Skip if node already exists
      if (nodeMap.has(currentPath)) continue;

      const isFile = i === parts.length - 1;
      const node: FileNode = {
        name: part,
        path: currentPath,
        type: isFile ? "file" : "directory",
        children: isFile ? undefined : [],
      };

      nodeMap.set(currentPath, node);

      if (parentPath) {
        const parent = nodeMap.get(parentPath);
        if (parent && parent.children) {
          parent.children.push(node);
        }
      } else {
        root.push(node);
      }
    }
  }

  // Sort each level: directories first, then alphabetically
  const sortNodes = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.type === "directory" && b.type === "file") return -1;
      if (a.type === "file" && b.type === "directory") return 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => {
      if (node.children) sortNodes(node.children);
    });
  };

  sortNodes(root);
  return root;
}

interface ChatStreamHandlers {
  onChunk: (chunk: string) => void;
  onFile: (path: string, content: string, isComplete: boolean) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
  /** A 204 instead of a stream: there was nothing (any more) to attach to. */
  onGone?: () => void;
}

/** Reads a generation's SSE stream - shared by starting a response and reattaching to one. */
function consumeChatStream(request: Promise<Response>, { onChunk, onFile, onComplete, onError, onGone }: ChatStreamHandlers) {
  // Matches only fully-closed <file path="...">...</file> tags for the "final,
  // definitely complete" content - deliberately not lenient about a missing closing
  // tag here, since a half-streamed file body would otherwise get reported as final.
  const FILE_TAG_REGEX = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;
  // Finds a still-open <file path="..."> tag (the model's protocol only ever has one
  // file open at a time), so its growing content can be tracked while it's written.
  const OPEN_FILE_TAG_REGEX = /<file\s+path="([^"]+)">/g;
  const emittedFilePaths = new Set<string>();

  const emitFileProgress = (buffer: string) => {
    FILE_TAG_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = FILE_TAG_REGEX.exec(buffer)) !== null) {
      const [, path, content] = match;
      if (emittedFilePaths.has(path)) continue;
      emittedFilePaths.add(path);
      onFile(path, content.trim(), true);
    }

    OPEN_FILE_TAG_REGEX.lastIndex = 0;
    let lastOpenMatch: RegExpExecArray | null = null;
    let openMatch: RegExpExecArray | null;
    while ((openMatch = OPEN_FILE_TAG_REGEX.exec(buffer)) !== null) {
      lastOpenMatch = openMatch;
    }
    if (lastOpenMatch) {
      const path = lastOpenMatch[1];
      const partial = buffer.slice(lastOpenMatch.index + lastOpenMatch[0].length);
      if (!partial.includes("</file>") && !emittedFilePaths.has(path)) {
        onFile(path, partial, false);
      }
    }
  };

  request
    .then(async (response) => {
      await ensureOk(response, "Chat stream failed");
      if (response.status === 204) {
        onGone?.();
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let sseBuffer = ""; // To handle split SSE lines
      let fullContentBuffer = ""; // To accumulate clean text for file regex
      let eventName = "message";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) {
            eventName = "message"; // blank line ends an SSE event
            continue;
          }
          if (trimmedLine.startsWith("event:")) {
            eventName = trimmedLine.slice(6).trim();
            continue;
          }
          if (!trimmedLine.startsWith("data:")) continue;

          const dataStr = trimmedLine.slice(5).trim();
          if (!dataStr) continue;

          let text: string;
          try {
            text = JSON.parse(dataStr).text ?? "";
          } catch (e) {
            console.error("Failed to parse SSE JSON:", e);
            continue;
          }

          // A failed generation arrives as an `event: error` frame on a 200 response, not as an HTTP error.
          if (eventName === "error") {
            await reader.cancel();
            throw new Error(text || "Something went wrong while generating a response.");
          }

          onChunk(text);
          fullContentBuffer += text;
          emitFileProgress(fullContentBuffer);
        }
      }

      onComplete();
    })
    .catch((error) => {
      if (error.name !== "AbortError") {
        console.error("Stream error:", error);
        onError(error);
      }
    });
}

export const api = {
  /**
   * Exchanges a fresh Firebase ID token for the httpOnly session cookie. The only moment an ID token leaves the
   * Firebase SDK - and nothing keeps it afterwards.
   */
  async createSession(idToken: string): Promise<SessionResponse> {
    const response = await apiFetch(`${BASE_URL}/api/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    await ensureOk(response, "Couldn't start your session");
    return response.json();
  },

  /** Ends every session of this account on every device, this one included. */
  async signOutEverywhere(): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/auth/logout-all`, { method: "POST", headers: { ...getAuthHeaders() } });
    await ensureOk(response, "Couldn't sign out of your other devices");
  },

  async getSecurityEvents(): Promise<AuthSecurityEvent[]> {
    const response = await apiFetch(`${BASE_URL}/api/auth/security-events`, { headers: { ...getAuthHeaders() } });
    await ensureOk(response, "Couldn't load recent account activity");
    return response.json();
  },

  /** Records a change made directly with Firebase (a second factor, a password) in the account's audit trail. */
  async reportSecurityEvent(type: AuthSecurityEventType, idToken: string): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/auth/security-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ type, idToken }),
    });
    await ensureOk(response, "Couldn't record the change");
  },

  /** Flat file paths - build the tree with `buildFileTree`, merged with any files that have only been streamed so far. */
  async getFilePaths(projectId: string): Promise<string[]> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/files`, {
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Failed to fetch files");
    const data: FilesApiResponse = await response.json();
    return data.files.map((file) => file.path);
  },

  async getFileContent(projectId: string, path: string): Promise<string> {
    const response = await apiFetch(
      `${BASE_URL}/api/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`,
      { headers: { ...getAuthHeaders() } }
    );
    await ensureOk(response, "Failed to fetch file content");
    const data = await response.json();
    return data.content;
  },

  async getProjects(): Promise<ProjectSummaryResponse[]> {
    const response = await apiFetch(`${BASE_URL}/api/projects`, {
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Failed to fetch projects");
    return response.json();
  },

  /** A few questions tailored to a new project idea, asked before anything is built. */
  async clarifyIdea(idea: string): Promise<ClarifyingQuestion[]> {
    const response = await apiFetch(`${BASE_URL}/api/ideas/clarify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ idea }),
    });
    await ensureOk(response, "Couldn't prepare questions for your idea");
    const data: { questions: ClarifyingQuestion[] } = await response.json();
    return data.questions ?? [];
  },

  /** Turns an idea and its interview answers into the brief sent as the new project's first chat message. */
  async compileIdea(idea: string, answers: IdeaAnswer[]): Promise<string> {
    const response = await apiFetch(`${BASE_URL}/api/ideas/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ idea, answers }),
    });
    await ensureOk(response, "Couldn't write the project brief");
    const data: { spec: string } = await response.json();
    return data.spec;
  },

  /** Creates a project named by the backend from the user's description of what they want to build. */
  async createProjectFromPrompt(prompt: string): Promise<ProjectResponse> {
    const response = await apiFetch(`${BASE_URL}/api/projects/from-prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ prompt }),
    });
    await ensureOk(response, "Failed to create project");
    return response.json();
  },

  async getProject(id: string): Promise<ProjectResponse> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${id}`, {
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Failed to fetch project");
    return response.json();
  },

  async updateProject(id: string, name: string): Promise<ProjectResponse> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ name }),
    });
    await ensureOk(response, "Failed to update project");
    return response.json();
  },

  /** Pinning is per user - it only changes the caller's own sidebar. */
  async setProjectPinned(id: string, pinned: boolean): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${id}/pin`, {
      method: pinned ? "PUT" : "DELETE",
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, pinned ? "Failed to pin project" : "Failed to unpin project");
  },

  /** Starring is per user, like pinning. */
  async setProjectStarred(id: string, starred: boolean): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${id}/star`, {
      method: starred ? "PUT" : "DELETE",
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, starred ? "Failed to star project" : "Failed to unstar project");
  },

  /** Copies a project the caller can edit into a new one they own. A blank name means "<name> (fork)". */
  async forkProject(id: string, name?: string): Promise<ProjectResponse> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${id}/fork`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ name: name?.trim() || null }),
    });
    await ensureOk(response, "Failed to fork project");
    return response.json();
  },

  async deleteProject(id: string): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${id}`, {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Failed to delete project");
  },

  /** The project's latest preview in any state, or null if it has never had one (204). */
  async getPreview(projectId: string): Promise<Preview | null> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/preview`, { headers: { ...getAuthHeaders() } });
    await ensureOk(response, "Couldn't check the preview");
    return response.status === 204 ? null : response.json();
  },

  /** Starts the preview, or returns the one already running. Resolves while it is still starting - poll getPreview. */
  async startPreview(projectId: string): Promise<Preview> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/preview`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Couldn't start the preview");
    return response.json();
  },

  /** Reinstalls dependencies and restarts the dev server in the same runner. */
  async restartPreview(projectId: string): Promise<Preview> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/preview/restart`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Couldn't restart the preview");
    return response.json();
  },

  async stopPreview(projectId: string | number): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/preview`, {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Couldn't stop the preview");
  },

  async getPreviewLogs(projectId: string): Promise<PreviewLogs> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/preview/logs`, { headers: { ...getAuthHeaders() } });
    await ensureOk(response, "Couldn't load the preview output");
    return response.json();
  },

  /** The caller's own starting or running previews across all projects - what their plan's allowance is spent on. */
  async getMyPreviews(): Promise<Preview[]> {
    const response = await apiFetch(`${BASE_URL}/api/previews`, { headers: { ...getAuthHeaders() } });
    await ensureOk(response, "Couldn't load your running previews");
    return response.json();
  },

  async downloadProjectZip(id: string): Promise<Blob> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${id}/files/download-zip`, {
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Failed to download project");
    return response.blob();
  },

  /**
   * Streams an explanation or an answer about selected code. The server sends plain text per SSE frame (not
   * JSON, unlike `/api/chat/stream`), with a failure arriving as a named `error` event on an already-200
   * response rather than an HTTP status.
   */
  streamCodeInsight(
    projectId: string,
    kind: "explain" | "ask",
    body: Record<string, unknown>,
    onChunk: (text: string) => void,
    onComplete: () => void,
    onError: (error: Error) => void
  ) {
    const controller = new AbortController();

    apiFetch(`${BASE_URL}/api/projects/${projectId}/code/${kind}/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (response) => {
        await ensureOk(response, "Couldn't get an answer from the AI");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        const stream = { failure: null as string | null };
        // Whole events, not raw lines: a chunk containing line breaks arrives as several `data:` lines of one
        // event, and emitting those separately used to delete every newline the model wrote (see lib/sse.ts).
        const parser = createSseParser(({ event, data }) => {
          if (stream.failure !== null) return;
          if (event === "error") stream.failure = data || "Couldn't get an answer from the AI right now.";
          else onChunk(data);
        });

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.push(decoder.decode(value, { stream: true }));
          if (stream.failure !== null) {
            await reader.cancel();
            throw new Error(stream.failure);
          }
        }
        parser.push(decoder.decode());
        parser.end();
        if (stream.failure !== null) throw new Error(stream.failure);
        onComplete();
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        onError(error instanceof Error ? error : new Error("Couldn't get an answer from the AI"));
      });

    return () => controller.abort();
  },

  // --- Billing ---

  /** The plan catalogue, cheapest first. Public: the pricing page works signed out. */
  async getPlans(): Promise<Plan[]> {
    const response = await apiFetch(`${BASE_URL}/api/plans`, { headers: { ...getAuthHeaders() } });
    await ensureOk(response, "Couldn't load the plans");
    return response.json();
  },

  /** What this account is on. Always returns a plan - free users get the free one. */
  async getMySubscription(): Promise<Subscription> {
    const response = await apiFetch(`${BASE_URL}/api/me/subscription`, { headers: { ...getAuthHeaders() } });
    await ensureOk(response, "Couldn't load your subscription");
    return response.json();
  },

  /** `projectId` adds that project's share of today, for the chat meter. */
  async getUsageToday(projectId?: string | number): Promise<UsageToday> {
    const query = projectId != null ? `?projectId=${encodeURIComponent(String(projectId))}` : "";
    const response = await apiFetch(`${BASE_URL}/api/usage/today${query}`, { headers: { ...getAuthHeaders() } });
    await ensureOk(response, "Couldn't load your usage");
    return response.json();
  },

  async getUsageInsights(range: UsageRange): Promise<UsageInsights> {
    const response = await apiFetch(`${BASE_URL}/api/usage/insights?range=${range}`, { headers: { ...getAuthHeaders() } });
    await ensureOk(response, "Couldn't load your usage insights");
    return response.json();
  },

  async getUsageEvents(page: number, size = 25): Promise<UsageEventPage> {
    const response = await apiFetch(`${BASE_URL}/api/usage/events?page=${page}&size=${size}`, { headers: { ...getAuthHeaders() } });
    await ensureOk(response, "Couldn't load your recent activity");
    return response.json();
  },

  /** The range's AI calls as CSV - a Blob, downloaded the same way a project ZIP is. */
  async exportUsageCsv(range: UsageRange): Promise<Blob> {
    const response = await apiFetch(`${BASE_URL}/api/usage/events/export?range=${range}`, { headers: { ...getAuthHeaders() } });
    await ensureOk(response, "Couldn't export your usage");
    return response.blob();
  },

  /** Returns the Stripe Checkout URL to send the browser to. */
  async createCheckout(planId: number): Promise<string> {
    const response = await apiFetch(`${BASE_URL}/api/payments/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ planId }),
    });
    await ensureOk(response, "Couldn't start checkout");
    return (await response.json()).checkoutUrl;
  },

  /** Returns the Stripe billing-portal URL, where a subscription is changed or cancelled. */
  async openBillingPortal(): Promise<string> {
    const response = await apiFetch(`${BASE_URL}/api/payments/portal`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Couldn't open the billing portal");
    return (await response.json()).portalUrl;
  },

  /**
   * Changes an existing subscription in place - upgrade, downgrade, cancel (the free plan) or resume (the plan
   * already held). Never a new checkout: that would start a second subscription billed alongside the first.
   */
  async changePlan(planId: number): Promise<Subscription> {
    const response = await apiFetch(`${BASE_URL}/api/payments/change-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ planId }),
    });
    await ensureOk(response, "Couldn't change your plan");
    return response.json();
  },

  /**
   * Settles the subscription from the session Stripe just sent the browser back with, rather than waiting on
   * the webhook - which in local development never arrives at all.
   */
  async confirmCheckout(sessionId: string): Promise<Subscription> {
    const response = await apiFetch(`${BASE_URL}/api/payments/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ sessionId }),
    });
    await ensureOk(response, "Couldn't confirm your payment");
    return response.json();
  },

  // --- Saved code notes ---
  //
  // The thread is the backend's, not the browser's: it belongs to one project *and* one signed-in user, and
  // lasts until they clear it. Nothing about it is kept in local or session storage, which is what stops one
  // member of a shared project seeing another's notes.

  /** The caller's saved thread for this project, oldest first. */
  async getCodeNotes(projectId: string): Promise<CodeNote[]> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/code/notes`, {
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Couldn't load your ExplainLLM notes");
    return response.json();
  },

  /** Keeps one finished exchange. Called when an answer completes - a half-read reply isn't worth saving. */
  async saveCodeNote(
    projectId: string,
    note: { question: string; answer: string; selection?: CodeSelection | null }
  ): Promise<CodeNote> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/code/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ ...note, selection: note.selection ?? null }),
    });
    await ensureOk(response, "Couldn't save this note");
    return response.json();
  },

  /** Wipes one exchange - the question, its answer and the snippet it quoted. */
  async deleteCodeNote(projectId: string, noteId: number): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/code/notes/${noteId}`, {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Couldn't delete this note");
  },

  /** Wipes the caller's whole thread for this project. */
  async clearCodeNotes(projectId: string): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/code/notes`, {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Couldn't clear these notes");
  },

  /** Plain-text (not regex) search across the project's text files. `signal` lets a newer query cancel this one. */
  async searchCode(projectId: string, query: string, signal?: AbortSignal): Promise<CodeSearchResponse> {
    const response = await apiFetch(
      `${BASE_URL}/api/projects/${projectId}/files/search?q=${encodeURIComponent(query)}`,
      { headers: { ...getAuthHeaders() }, signal }
    );
    await ensureOk(response, "Couldn't search this project");
    return response.json();
  },

  /** One-shot plain-language explanation of a selected block. Read-only - it can never change a file. */
  async explainCode(projectId: string, selection: CodeSelection): Promise<string> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/code/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(selection),
    });
    await ensureOk(response, "Couldn't explain this code");
    const data: { answer: string } = await response.json();
    return data.answer;
  },

  /**
   * A follow-up question about a selected block. The thread isn't stored server-side, so the whole
   * conversation so far is replayed on every request.
   */
  async askAboutCode(
    projectId: string,
    selection: CodeSelection,
    question: string,
    history: { role: "user" | "assistant"; content: string }[]
  ): Promise<string> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/code/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ ...selection, question, history }),
    });
    await ensureOk(response, "Couldn't answer that question");
    const data: { answer: string } = await response.json();
    return data.answer;
  },

  async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/members`, {
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Failed to fetch project members");
    return response.json();
  },

  async inviteMember(projectId: string, username: string, role: ProjectRole): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ username, role }),
    });
    await ensureOk(response, "Failed to invite member");
  },

  async updateMemberRole(projectId: string, userId: number, role: ProjectRole): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ role }),
    });
    await ensureOk(response, "Failed to update member role");
  },

  async removeMember(projectId: string, userId: number): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/members/${userId}`, {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Failed to remove member");
  },

  async getChatHistory(projectId: string): Promise<ChatMessage[]> {
    const response = await apiFetch(`${BASE_URL}/api/chat/projects/${projectId}`, {
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Failed to fetch chat history");
    return response.json();
  },

  /**
   * The latest saved turn's changed files, each with its version from before that turn - what the diff toggle compares
   * against. Stored server-side, so the diff survives a refresh and signing out and back in.
   */
  async getLastTurnChanges(projectId: string): Promise<{ files: { path: string; previousContent: string }[] }> {
    const response = await apiFetch(`${BASE_URL}/api/chat/projects/${projectId}/last-turn-changes`, {
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Couldn't load the last changes");
    return response.json();
  },

  /** The caller's response still being generated for this project, or null. Survives a page refresh - it runs server-side. */
  async getActiveGeneration(projectId: string): Promise<ActiveGeneration | null> {
    const response = await apiFetch(`${BASE_URL}/api/chat/projects/${projectId}/active`, {
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Couldn't check for a response in progress");
    return response.status === 204 ? null : response.json();
  },

  /** Stops the response in flight on the server. Closing the stream alone no longer does. */
  async stopGeneration(projectId: string): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/chat/projects/${projectId}/active/stop`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    await ensureOk(response, "Couldn't stop the response");
  },

  /** Starts a response and streams it. Aborting only stops watching - the response keeps going server-side. */
  streamChat(
    projectId: string,
    message: string,
    onChunk: (chunk: string) => void,
    /** Fires repeatedly with growing content while a file is written (`isComplete` false), then once with its final content. */
    onFile: (path: string, content: string, isComplete: boolean) => void,
    onComplete: () => void,
    onError: (error: Error) => void,
    /** `teachingMode` asks the AI to explain the concept behind each file it writes, as `<learn>` tags. */
    options: { teachingMode?: boolean } = {}
  ) {
    const controller = new AbortController();
    const request = apiFetch(`${BASE_URL}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ message, projectId, teachingMode: options.teachingMode === true }),
      signal: controller.signal,
    });
    consumeChatStream(request, { onChunk, onFile, onComplete, onError });
    return () => controller.abort();
  },

  /**
   * Reattaches to a response already being generated - after a refresh, or from a second tab. The first chunk is
   * everything written so far, so the same parser rebuilds the files and messages exactly as a live stream would.
   * `onGone` fires instead if the response finished in the moment between checking and attaching.
   */
  resumeChat(
    projectId: string,
    onChunk: (chunk: string) => void,
    onFile: (path: string, content: string, isComplete: boolean) => void,
    onComplete: () => void,
    onError: (error: Error) => void,
    onGone: () => void
  ) {
    const controller = new AbortController();
    const request = apiFetch(`${BASE_URL}/api/chat/projects/${projectId}/active/stream`, {
      headers: { ...getAuthHeaders() },
      signal: controller.signal,
    });
    consumeChatStream(request, { onChunk, onFile, onComplete, onError, onGone });
    return () => controller.abort();
  }

};
