export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export type PreviewStatus = "CREATING" | "RUNNING" | "FAILED" | "TERMINATED";

/** A project's live preview: its files running in a Vite dev server at a URL of their own. */
export interface Preview {
  id: number;
  projectId: number;
  /** Only on the caller's list of running previews, where rows span projects. */
  projectName?: string | null;
  status: PreviewStatus;
  /** Known from the start, but only answers once the status is RUNNING. */
  previewUrl: string;
  /** The step in progress while CREATING; why it ended once FAILED or TERMINATED. */
  detail: string | null;
  startedAt: string | null;
  readyAt: string | null;
  terminatedAt: string | null;
  /** When it will be stopped for inactivity if nobody looks at it again - RUNNING only. */
  stopsAt: string | null;
  /** Whoever started it, or anyone who can edit the project. */
  canStop: boolean;
}

export interface PreviewLogs {
  log: string | null;
  /** True when read from the running preview just now; false for the output saved when a start failed. */
  live: boolean;
}

export interface ChatHistoryMessage {
  id: number;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

export enum ChatEventType {
  THOUGHT = 'THOUGHT',
  MESSAGE = 'MESSAGE',
  /** One step of the build checklist, announced before any file is written. */
  TODO = 'TODO',
  FILE_EDIT = 'FILE_EDIT',
  /** A file the AI removed - how a rename or move gets rid of the old copy. */
  FILE_DELETE = 'FILE_DELETE',
  /** Teaching mode: a plain-English note on the concept the file just written uses, and why. */
  LEARN = 'LEARN',
  TOOL_LOG = 'TOOL_LOG'
}

export interface ChatEvent {
  id?: number;
  type: ChatEventType;
  content: string; // Markdown, Code, or Tool Summary
  metadata?: string; // Tool args (e.g. "src/App.tsx"), or a LEARN event's concept name (e.g. "Custom hooks")
  filePath?: string; // For FILE_EDIT; optionally for TODO (the file that step writes) and LEARN (the file it explains)
  sequenceOrder?: number;
  isComplete?: boolean; // Live-stream only: closing tag has arrived. Saved events are always complete.
}

export interface ChatMessage {
  id: number;
  role: 'USER' | 'ASSISTANT';
  content?: string; // Fallback raw text
  events: ChatEvent[]; // The granular events
  createdAt?: string;
}

export interface ProjectSummaryResponse {
  id: number;
  name: string;
  description?: string;
  thumbnailUrl?: string; // Optional URL for project thumbnail
  role?: ProjectRole; // Added to show user's role in the project list
  createdAt: string;
  updatedAt?: string;
  pinnedAt?: string | null; // Set when the current user pinned it to their sidebar
  starredAt?: string | null; // Set when the current user starred it
}

export interface ProjectResponse {
  id: number;
  name: string;
  role?: ProjectRole; // Added to check user's permission in the project
  createdAt: string;
  updatedAt?: string;
  templateInitIssue?: string | null; // Non-null when the starter template didn't fully copy
  /** Set when this project is a fork: the id of the project it was copied from. */
  forkedFromProjectId?: number | null;
}

export interface ProjectRequest {
  name: string;
}

export type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER';

/**
 * One question from the pre-project interview. The questions are written by the AI for each specific idea, so
 * `id` is an arbitrary slug (e.g. `seat_limits`) rather than one of a known set - treat it as an opaque key to
 * group answers by, and send it back unchanged on `IdeaAnswer.questionId`. How many arrive depends on how much
 * the idea already says. The last one is always about look and feel.
 */
export interface ClarifyingQuestion {
  id: string;
  question: string;
  helper?: string | null;
  options: string[];
  multiSelect: boolean;
}

/** What was picked or typed for one interview question; an empty `answers` list means it was skipped. */
export interface IdeaAnswer {
  questionId: string;
  question: string;
  answers: string[];
}

export interface ProjectMember {
  userId: number; // Changed to number based on schema
  username: string; // The email/username
  name?: string;
  role: ProjectRole;
  invitedAt?: string;
}

export interface InviteMemberRequest {
  username: string;
  role: ProjectRole;
}

/** One matching line from a code search. `column`/`length` index into `text`, which is already trimmed. */
export interface CodeSearchMatch {
  line: number;
  text: string;
  column: number;
  length: number;
}

export interface CodeSearchFileResult {
  path: string;
  matches: CodeSearchMatch[];
  /** This file had more matches than the per-file cap returned. */
  truncated: boolean;
}

export interface CodeSearchResponse {
  query: string;
  fileCount: number;
  matchCount: number;
  /** The overall cap was hit - there are more results than these. */
  truncated: boolean;
  files: CodeSearchFileResult[];
}

/** The block of code a lens conversation is about. Line numbers are 1-based, as the editor shows them. */
export interface CodeSelection {
  path: string;
  code: string;
  startLine: number;
  endLine: number;
}

/**
 * One saved code-notes exchange, as the backend keeps it: a question, its answer, and the block the question
 * was about. Private to whoever asked it - the server scopes every note query to the caller's own id, so a
 * shared project doesn't mean a shared thread.
 */
export interface CodeNote {
  id: number;
  question: string;
  answer: string;
  selection?: CodeSelection | null;
  createdAt?: string;
}

// --- Billing ---

/** One plan from the catalogue. `price` is already formatted server-side ("₹499", "Free"). */
export interface Plan {
  id: number | null;
  name: string;
  tagline?: string | null;
  maxProjects: number | null;
  maxTokensPerDay: number | null;
  /** Live previews that may run at once. */
  maxPreviews?: number | null;
  /** Reported for compatibility, enforced nowhere, and deliberately never shown - see Plan.unlimitedAi. */
  unlimitedAi?: boolean | null;
  price: string;
  priceAmountMinor: number | null;
  currency: string | null;
  billingInterval: string | null;
  isFree: boolean;
}

export type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "INCOMPLETE";

/** What the caller is on right now. Never has a null plan: free users get the free plan back. */
export interface Subscription {
  plan: Plan;
  status: SubscriptionStatus | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  isFree: boolean;
}

/** Everything needed to answer "how much have I got left?" - one call, one source of truth. */
export interface UsageToday {
  tokensUsed: number;
  tokensLimit: number;
  previewsRunning: number;
  previewsLimit: number;
  projectsUsed: number;
  projectsLimit: number;
  /** When the daily token allowance refills, computed in the server's zone. */
  resetsAt: string;
  planName: string;
  /** Today's tokens on the project the request named - absent when none was given. */
  projectTokensToday?: number | null;
  /** The caller's most recent AI call. */
  lastRequest?: LastRequestUsage | null;
}

export type UsageFeature = "BUILD" | "BUILD_RETRY" | "EXPLAIN" | "IDEA_INTERVIEW" | "PROJECT_NAMING" | "UNATTRIBUTED";

export interface LastRequestUsage {
  feature: UsageFeature;
  projectId: number | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  at: string;
}

export type UsageRange = "today" | "7d" | "30d" | "90d";

export interface UsageSeriesPoint {
  /** ISO date, or "HH:00" on the Today view. */
  key: string;
  byFeature: Partial<Record<UsageFeature, number>>;
  unattributed: number;
  total: number;
  limitReached: boolean;
}

export interface UsageInsights {
  range: UsageRange;
  from: string;
  to: string;
  dailyLimit: number;
  planName: string;
  totals: { inputTokens: number; outputTokens: number; totalTokens: number; requests: number };
  averagePerDay: number;
  peakDay: { date: string; totalTokens: number } | null;
  daysAtLimit: number;
  series: UsageSeriesPoint[];
  byFeature: { feature: UsageFeature; totalTokens: number; requests: number; share: number }[];
  byProject: { projectId: number; name: string; deleted: boolean; totalTokens: number; share: number }[];
}

export interface UsageEvent {
  id: number;
  createdAt: string;
  projectId: number | null;
  projectName: string | null;
  feature: UsageFeature;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface UsageEventPage {
  events: UsageEvent[];
  page: number;
  size: number;
  hasMore: boolean;
}

/** The numbers behind a 402, off the error body - so a banner can show a bar and a countdown. */
export interface QuotaDetails {
  reason: "DAILY_TOKENS" | "PROJECT_LIMIT" | "PREVIEW_LIMIT";
  limit: number;
  used: number;
  resetsAt?: string | null;
  planName: string;
}

export interface SessionResponse {
  user: { id: number; username: string; name: string };
  /** ISO timestamp - when the httpOnly session cookie expires. */
  expiresAt: string;
  newAccount: boolean;
  /** False when the sign-in used a single factor - the cue to suggest two-step verification. */
  secondFactorUsed: boolean;
}

export type AuthSecurityEventType =
  | "ACCOUNT_CREATED"
  | "ACCOUNT_LINKED"
  | "SIGN_IN"
  | "SIGN_IN_REJECTED"
  | "SIGN_OUT"
  | "SIGN_OUT_EVERYWHERE"
  | "MFA_ENROLLED"
  | "MFA_REMOVED"
  | "PASSWORD_CHANGED";

export interface AuthSecurityEvent {
  id: number;
  type: AuthSecurityEventType;
  ipAddress: string | null;
  userAgent: string | null;
  detail: string | null;
  createdAt: string;
}

/** A response still being generated server-side for this user and project - what a refreshed page reattaches to. */
export interface ActiveGeneration {
  userMessage: string;
  /** ISO timestamp. */
  startedAt: string;
  teachingMode: boolean;
  /** RUNNING while the model writes; SAVING once it has finished and the turn is being stored. */
  status: "RUNNING" | "SAVING";
}
