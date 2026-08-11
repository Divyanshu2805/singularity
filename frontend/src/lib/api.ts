/**
 * Every call this app makes to the backend.
 *
 * Handles: the one fetch wrapper all of them go through, the session cookie and CSRF token that ride along with it,
 * turning a failed response into a typed error the UI can react to, the SSE streams behind the build chat and the
 * code lens, and the typed methods for projects, files, previews, chat, code notes, ideas, billing, usage and auth.
 *
 * The session is an httpOnly cookie, so a write must also carry the readable CSRF token in a header - fetched first
 * if this browser has none, and re-fetched once if the server rejects it, which is what a stale token looks like. A
 * network failure is rewritten into a clear sentence rather than the browser's vague default, and a 401 takes the app
 * through a full sign-out so no stale state survives.
 *
 * Requests are relative by default: in development Vite proxies them to the Gateway, so the browser only ever talks
 * to one origin and the SameSite cookie is always sent.
 */
import { Preview, PreviewLogs, ActiveGeneration, AuthSecurityEvent, AuthSecurityEventType, SessionResponse, ChatMessage, ClarifyingQuestion, CodeNote, CodeSearchResponse, CodeSelection, FileNode, Plan, QuotaDetails, Subscription, UsageEventPage, UsageInsights, UsageRange, UsageToday, IdeaAnswer, ProjectSummaryResponse, ProjectResponse, ProjectMember, ProjectRole } from "./types";
import { createSseParser } from "./sse";
import { CSRF_HEADER, ensureCsrfToken, needsCsrf, readCsrfToken } from "./csrf";
import { clearSignedInState, signOutRedirect } from "./session";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const SERVER_UNREACHABLE = "Can't reach the VibeCraft server. Make sure the backend is running (the Gateway listens on port 8000).";

const rawFetch = (input: string, init?: RequestInit) =>
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

const SESSION_HINT_KEY = "session_expires_at";

const hasSessionHint = () => {
  const expiresAt = Date.parse(localStorage.getItem(SESSION_HINT_KEY) ?? "");
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
};

export const renewSession = (session: SessionResponse) => {
  localStorage.setItem(SESSION_HINT_KEY, session.expiresAt);
  setUserInfo(session.user);
};

export const startSession = (session: SessionResponse) => {
  clearSignedInState();
  localStorage.setItem(SESSION_HINT_KEY, session.expiresAt);
  setUserInfo(session.user);
};

export const isAuthenticated = () => hasSessionHint() && !!getUserInfo();

export const loginRedirectPath = () =>
  localStorage.getItem(SESSION_HINT_KEY) ? "/login?expired=1" : "/login";

export const setUserInfo = (user: { id: number; username: string; name: string }) => {
  localStorage.setItem("user_info", JSON.stringify(user));
};

export const getUserInfo = (): { id: number; username: string; name: string } | null => {
  const userInfo = localStorage.getItem("user_info");
  return userInfo ? JSON.parse(userInfo) : null;
};

export const removeUserInfo = () => localStorage.removeItem("user_info");

export const OPEN_TABS_KEY = "open_tabs";
export const ACTIVE_TAB_KEY = "active_tab";

export const signOut = (to = "/login") => {
  const csrfToken = readCsrfToken();
  fetch(`${BASE_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: csrfToken ? { [CSRF_HEADER]: csrfToken } : {},
  }).catch(() => undefined);

  localStorage.removeItem(SESSION_HINT_KEY);
  removeUserInfo();
  clearSignedInState();
  if (!window.location.pathname.startsWith("/login")) {
    signOutRedirect(to);
  }
};

const endSession = () => signOut("/login?expired=1");

export class ApiRequestError extends Error {
  readonly status: number;
  readonly quota?: QuotaDetails;
  readonly code?: string;

  constructor(message: string, status: number, quota?: QuotaDetails, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.quota = quota;
    this.code = code;
  }
}

export const isQuotaError = (error: unknown): error is ApiRequestError =>
  error instanceof ApiRequestError && error.status === 402;

async function ensureOk(response: Response, fallbackMessage: string): Promise<Response> {
  if (response.ok) return response;
  if (response.status === 401 && isAuthenticated()) endSession();

  let message = fallbackMessage;
  let quota: QuotaDetails | undefined;
  let code: string | undefined;
  try {
    const body = await response.json();
    if (typeof body?.message === "string" && body.message) message = body.message;
    if (body?.quota && typeof body.quota?.reason === "string") quota = body.quota as QuotaDetails;
    if (typeof body?.code === "string" && body.code) code = body.code;
  } catch {
    if (response.status >= 500) message = SERVER_UNREACHABLE;
  }
  throw new ApiRequestError(message, response.status, quota, code);
}

interface FilesApiResponse {
  files: { path: string }[];
}

export function buildFileTree(paths: string[]): FileNode[] {
  const root: FileNode[] = [];
  const nodeMap = new Map<string, FileNode>();

  const sortedPaths = [...paths].sort((a, b) => a.localeCompare(b));

  for (const path of sortedPaths) {
    const parts = path.split("/");
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

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
  onGone?: () => void;
}

function consumeChatStream(request: Promise<Response>, { onChunk, onFile, onComplete, onError, onGone }: ChatStreamHandlers) {
  const FILE_TAG_REGEX = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;
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
      let sseBuffer = "";
      let fullContentBuffer = "";
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
            eventName = "message";
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
  async createSession(idToken: string): Promise<SessionResponse> {
    const response = await apiFetch(`${BASE_URL}/api/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    await ensureOk(response, "Couldn't start your session");
    return response.json();
  },

  async signOutEverywhere(): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/auth/logout-all`, { method: "POST" });
    await ensureOk(response, "Couldn't sign out of your other devices");
  },

  async getSecurityEvents(): Promise<AuthSecurityEvent[]> {
    const response = await apiFetch(`${BASE_URL}/api/auth/security-events`);
    await ensureOk(response, "Couldn't load recent account activity");
    return response.json();
  },

  async reportSecurityEvent(type: AuthSecurityEventType, idToken: string): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/auth/security-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, idToken }),
    });
    await ensureOk(response, "Couldn't record the change");
  },

  async getFilePaths(projectId: string): Promise<string[]> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/files`, {
    });
    await ensureOk(response, "Failed to fetch files");
    const data: FilesApiResponse = await response.json();
    return data.files.map((file) => file.path);
  },

  async getFileContent(projectId: string, path: string): Promise<string> {
    const response = await apiFetch(
      `${BASE_URL}/api/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`
    );
    await ensureOk(response, "Failed to fetch file content");
    const data = await response.json();
    return data.content;
  },

  async getProjects(): Promise<ProjectSummaryResponse[]> {
    const response = await apiFetch(`${BASE_URL}/api/projects`, {
    });
    await ensureOk(response, "Failed to fetch projects");
    return response.json();
  },

  async clarifyIdea(idea: string): Promise<ClarifyingQuestion[]> {
    const response = await apiFetch(`${BASE_URL}/api/ideas/clarify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea }),
    });
    await ensureOk(response, "Couldn't prepare questions for your idea");
    const data: { questions: ClarifyingQuestion[] } = await response.json();
    return data.questions ?? [];
  },

  async compileIdea(idea: string, answers: IdeaAnswer[]): Promise<string> {
    const response = await apiFetch(`${BASE_URL}/api/ideas/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea, answers }),
    });
    await ensureOk(response, "Couldn't write the project brief");
    const data: { spec: string } = await response.json();
    return data.spec;
  },

  async createProjectFromPrompt(prompt: string): Promise<ProjectResponse> {
    const response = await apiFetch(`${BASE_URL}/api/projects/from-prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    await ensureOk(response, "Failed to create project");
    return response.json();
  },

  async getProject(id: string): Promise<ProjectResponse> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${id}`, {
    });
    await ensureOk(response, "Failed to fetch project");
    return response.json();
  },

  async updateProject(id: string, name: string): Promise<ProjectResponse> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await ensureOk(response, "Failed to update project");
    return response.json();
  },

  async setProjectPinned(id: string, pinned: boolean): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${id}/pin`, {
      method: pinned ? "PUT" : "DELETE",
    });
    await ensureOk(response, pinned ? "Failed to pin project" : "Failed to unpin project");
  },

  async setProjectStarred(id: string, starred: boolean): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${id}/star`, {
      method: starred ? "PUT" : "DELETE",
    });
    await ensureOk(response, starred ? "Failed to star project" : "Failed to unstar project");
  },

  async forkProject(id: string, name?: string): Promise<ProjectResponse> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${id}/fork`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name?.trim() || null }),
    });
    await ensureOk(response, "Failed to fork project");
    return response.json();
  },

  async deleteProject(id: string): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${id}`, {
      method: "DELETE",
    });
    await ensureOk(response, "Failed to delete project");
  },

  async getPreview(projectId: string): Promise<Preview | null> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/preview`);
    await ensureOk(response, "Couldn't check the preview");
    return response.status === 204 ? null : response.json();
  },

  async startPreview(projectId: string): Promise<Preview> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/preview`, {
      method: "POST",
    });
    await ensureOk(response, "Couldn't start the preview");
    return response.json();
  },

  async restartPreview(projectId: string): Promise<Preview> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/preview/restart`, {
      method: "POST",
    });
    await ensureOk(response, "Couldn't restart the preview");
    return response.json();
  },

  async stopPreview(projectId: string | number): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/preview`, {
      method: "DELETE",
    });
    await ensureOk(response, "Couldn't stop the preview");
  },

  async getPreviewLogs(projectId: string): Promise<PreviewLogs> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/preview/logs`);
    await ensureOk(response, "Couldn't load the preview output");
    return response.json();
  },

  async getMyPreviews(): Promise<Preview[]> {
    const response = await apiFetch(`${BASE_URL}/api/previews`);
    await ensureOk(response, "Couldn't load your running previews");
    return response.json();
  },

  async downloadProjectZip(id: string): Promise<{ blob: Blob; missingFileCount: number }> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${id}/files/download-zip`, {
    });
    await ensureOk(response, "Failed to download project");
    const missingFileCount = Number(response.headers.get("X-Missing-File-Count") ?? "0") || 0;
    return { blob: await response.blob(), missingFileCount };
  },

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (response) => {
        await ensureOk(response, "Couldn't get an answer from the AI");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        const stream = { failure: null as string | null };
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

  async getPlans(): Promise<Plan[]> {
    const response = await apiFetch(`${BASE_URL}/api/plans`);
    await ensureOk(response, "Couldn't load the plans");
    return response.json();
  },

  async getMySubscription(): Promise<Subscription> {
    const response = await apiFetch(`${BASE_URL}/api/me/subscription`);
    await ensureOk(response, "Couldn't load your subscription");
    return response.json();
  },

  async getUsageToday(projectId?: string | number): Promise<UsageToday> {
    const query = projectId != null ? `?projectId=${encodeURIComponent(String(projectId))}` : "";
    const response = await apiFetch(`${BASE_URL}/api/usage/today${query}`);
    await ensureOk(response, "Couldn't load your usage");
    return response.json();
  },

  async getUsageInsights(range: UsageRange): Promise<UsageInsights> {
    const response = await apiFetch(`${BASE_URL}/api/usage/insights?range=${range}`);
    await ensureOk(response, "Couldn't load your usage insights");
    return response.json();
  },

  async getUsageEvents(page: number, size = 25): Promise<UsageEventPage> {
    const response = await apiFetch(`${BASE_URL}/api/usage/events?page=${page}&size=${size}`);
    await ensureOk(response, "Couldn't load your recent activity");
    return response.json();
  },

  async exportUsageCsv(range: UsageRange): Promise<Blob> {
    const response = await apiFetch(`${BASE_URL}/api/usage/events/export?range=${range}`);
    await ensureOk(response, "Couldn't export your usage");
    return response.blob();
  },

  async createCheckout(planId: number): Promise<string> {
    const response = await apiFetch(`${BASE_URL}/api/payments/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    await ensureOk(response, "Couldn't start checkout");
    return (await response.json()).checkoutUrl;
  },

  async openBillingPortal(): Promise<string> {
    const response = await apiFetch(`${BASE_URL}/api/payments/portal`, {
      method: "POST",
    });
    await ensureOk(response, "Couldn't open the billing portal");
    return (await response.json()).portalUrl;
  },

  async changePlan(planId: number): Promise<Subscription> {
    const response = await apiFetch(`${BASE_URL}/api/payments/change-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    await ensureOk(response, "Couldn't change your plan");
    return response.json();
  },

  async confirmCheckout(sessionId: string): Promise<Subscription> {
    const response = await apiFetch(`${BASE_URL}/api/payments/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    await ensureOk(response, "Couldn't confirm your payment");
    return response.json();
  },

  async getCodeNotes(projectId: string): Promise<CodeNote[]> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/code/notes`, {
    });
    await ensureOk(response, "Couldn't load your ExplainLLM notes");
    return response.json();
  },

  async saveCodeNote(
    projectId: string,
    note: { question: string; answer: string; selection?: CodeSelection | null }
  ): Promise<CodeNote> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/code/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...note, selection: note.selection ?? null }),
    });
    await ensureOk(response, "Couldn't save this note");
    return response.json();
  },

  async deleteCodeNote(projectId: string, noteId: number): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/code/notes/${noteId}`, {
      method: "DELETE",
    });
    await ensureOk(response, "Couldn't delete this note");
  },

  async clearCodeNotes(projectId: string): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/code/notes`, {
      method: "DELETE",
    });
    await ensureOk(response, "Couldn't clear these notes");
  },

  async searchCode(projectId: string, query: string, signal?: AbortSignal): Promise<CodeSearchResponse> {
    const response = await apiFetch(
      `${BASE_URL}/api/projects/${projectId}/files/search?q=${encodeURIComponent(query)}`,
      { signal }
    );
    await ensureOk(response, "Couldn't search this project");
    return response.json();
  },

  async explainCode(projectId: string, selection: CodeSelection): Promise<string> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/code/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selection),
    });
    await ensureOk(response, "Couldn't explain this code");
    const data: { answer: string } = await response.json();
    return data.answer;
  },

  async askAboutCode(
    projectId: string,
    selection: CodeSelection,
    question: string,
    history: { role: "user" | "assistant"; content: string }[]
  ): Promise<string> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/code/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...selection, question, history }),
    });
    await ensureOk(response, "Couldn't answer that question");
    const data: { answer: string } = await response.json();
    return data.answer;
  },

  async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/members`, {
    });
    await ensureOk(response, "Failed to fetch project members");
    return response.json();
  },

  async inviteMember(projectId: string, username: string, role: ProjectRole): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, role }),
    });
    await ensureOk(response, "Failed to invite member");
  },

  async updateMemberRole(projectId: string, userId: number, role: ProjectRole): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    await ensureOk(response, "Failed to update member role");
  },

  async removeMember(projectId: string, userId: number): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/projects/${projectId}/members/${userId}`, {
      method: "DELETE",
    });
    await ensureOk(response, "Failed to remove member");
  },

  async getChatHistory(projectId: string): Promise<ChatMessage[]> {
    const response = await apiFetch(`${BASE_URL}/api/chat/projects/${projectId}`, {
    });
    await ensureOk(response, "Failed to fetch chat history");
    return response.json();
  },

  async getLastTurnChanges(projectId: string): Promise<{ files: { path: string; previousContent: string }[] }> {
    const response = await apiFetch(`${BASE_URL}/api/chat/projects/${projectId}/last-turn-changes`, {
    });
    await ensureOk(response, "Couldn't load the last changes");
    return response.json();
  },

  async getActiveGeneration(projectId: string): Promise<ActiveGeneration | null> {
    const response = await apiFetch(`${BASE_URL}/api/chat/projects/${projectId}/active`, {
    });
    await ensureOk(response, "Couldn't check for a response in progress");
    return response.status === 204 ? null : response.json();
  },

  async stopGeneration(projectId: string): Promise<void> {
    const response = await apiFetch(`${BASE_URL}/api/chat/projects/${projectId}/active/stop`, {
      method: "POST",
    });
    await ensureOk(response, "Couldn't stop the response");
  },

  streamChat(
    projectId: string,
    message: string,
    onChunk: (chunk: string) => void,
    onFile: (path: string, content: string, isComplete: boolean) => void,
    onComplete: () => void,
    onError: (error: Error) => void,
    options: { teachingMode?: boolean } = {}
  ) {
    const controller = new AbortController();
    const request = apiFetch(`${BASE_URL}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, projectId, teachingMode: options.teachingMode === true }),
      signal: controller.signal,
    });
    consumeChatStream(request, { onChunk, onFile, onComplete, onError });
    return () => controller.abort();
  },

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
      signal: controller.signal,
    });
    consumeChatStream(request, { onChunk, onFile, onComplete, onError, onGone });
    return () => controller.abort();
  }

};
