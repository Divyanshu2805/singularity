/**
 * The shapes the backend actually returns, as the app sees them.
 *
 * Handles: projects and their members, files and search results, revisions, previews, chat messages and events, code notes and
 * selections, plans, subscriptions and quota details, usage totals and insights, the session response and the auth
 * security trail.
 *
 * This is the contract with the API: when a response shape changes server-side, it changes here in the same commit.
 */
export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export type PreviewStatus = "CREATING" | "RUNNING" | "FAILED" | "TERMINATED";
export type PreviewFailureKind = "INSTALL" | "DEV_SERVER" | "TIMEOUT" | "CAPACITY" | "PLATFORM";
export type PreviewSyncState = "UP_TO_DATE" | "UPDATING";

export interface Preview {
  id: number;
  projectId: number;
  projectName?: string | null;
  status: PreviewStatus;
  previewUrl: string;
  detail: string | null;
  startedAt: string | null;
  readyAt: string | null;
  terminatedAt: string | null;
  stopsAt: string | null;
  canStop: boolean;
  failureKind?: PreviewFailureKind | null;
  queuePosition?: number | null;
  syncState?: PreviewSyncState | null;
  syncDetail?: string | null;
  syncedRevisionId?: number | null;
}

export interface PreviewLogs {
  log: string | null;
  live: boolean;
}

export type PublishBuildStatus = "BUILDING" | "FAILED";
export type PublishFailureKind = "INSTALL" | "BUILD" | "NO_OUTPUT" | "TOO_LARGE" | "TIMEOUT" | "CAPACITY" | "PLATFORM";

export interface PublishBuild {
  status: PublishBuildStatus;
  step: string | null;
  startedAt: string | null;
  failureKind: PublishFailureKind | null;
  failureMessage: string | null;
}

export interface PublishState {
  live: boolean;
  url: string | null;
  slug: string | null;
  suggestedSlug: string | null;
  publishedAt: string | null;
  hasChanges: boolean;
  shared: boolean;
  build: PublishBuild | null;
}

export interface PublicApp {
  name: string;
  slug: string;
  url: string;
  publishedAt: string | null;
  fileCount: number;
}

export interface PublicFile {
  path: string;
  size: number;
}

export interface PublicFileContent {
  path: string;
  content: string;
  binary: boolean;
}

export enum ChatEventType {
  THOUGHT = 'THOUGHT',
  MESSAGE = 'MESSAGE',
  TODO = 'TODO',
  FILE_EDIT = 'FILE_EDIT',
  FILE_PATCH = 'FILE_PATCH',
  FILE_DELETE = 'FILE_DELETE',
  LEARN = 'LEARN',
  TOOL_LOG = 'TOOL_LOG',
  ASK = 'ASK',
  THINKING = 'THINKING'
}

export type TurnOutcome = "SAVED" | "ANSWERED" | "INCOMPLETE" | "NOT_SAVED" | "EMPTY" | "FAILED" | "STOPPED" | "OUT_OF_BUDGET";

export interface ChatEvent {
  id?: number;
  type: ChatEventType;
  content: string;
  metadata?: string;
  filePath?: string;
  sequenceOrder?: number;
  isComplete?: boolean;
  /** The lesson teaching mode has already written about this file edit, when it has been opened before. */
  lesson?: string | null;
  /** The "try changing this" task already set from this file edit, when one was asked for. */
  task?: string | null;
  /** True once the check of that task found the change made. */
  taskDone?: boolean;
}

export interface ChatMessage {
  id: number;
  role: 'USER' | 'ASSISTANT';
  content?: string;
  events: ChatEvent[];
  createdAt?: string;
  /** True on an assistant turn that was asked for in teaching mode: only its steps can be opened for a lesson. */
  teaching?: boolean;
  /** The big picture teaching mode has already written about this turn, when it has been shown before. */
  overview?: string | null;
  /** The revision an assistant turn's files were published as; absent when it wrote none. Undo restores to before it. */
  revisionId?: number | null;
}

export type RevisionStatus = "STAGING" | "APPLIED" | "FAILED" | "CONFLICT";
export type RevisionSource = "AI_GENERATION" | "MANUAL_EDIT" | "RESTORE";

export interface RevisionSummary {
  id: number;
  parentRevisionId: number | null;
  status: RevisionStatus;
  source: RevisionSource;
  createdByUserId: number | null;
  createdAt: string | null;
  appliedAt: string | null;
  changedPaths: string[];
  /** On a revision made by going back: the revision that was chosen, and whether the project went to just before it. */
  restoredRevisionId?: number | null;
  restoredBefore?: boolean | null;
}

export interface RevisionChange {
  path: string;
  kind: "ADDED" | "MODIFIED" | "DELETED";
}

export interface RestoreResult {
  revisionId: number | null;
  status: "APPLIED" | "FAILED" | "CONFLICT";
  currentRevisionId: number | null;
  failedPaths: string[];
}

export interface FileContent {
  path: string;
  content: string;
  /** SHA-256 of the stored bytes; a save by hand sends it back as the version the edit was made against. */
  hash: string | null;
}

export interface SavedFile {
  path: string;
  hash: string;
  /** Null when the content was already what the file held and nothing was written. */
  revisionId: number | null;
}

export interface ProjectSummaryResponse {
  id: number;
  name: string;
  description?: string;
  thumbnailUrl?: string;
  role?: ProjectRole;
  createdAt: string;
  updatedAt?: string;
  pinnedAt?: string | null;
  starredAt?: string | null;
  publishedUrl?: string | null;
}

export interface ProjectResponse {
  id: number;
  name: string;
  role?: ProjectRole;
  createdAt: string;
  updatedAt?: string;
  templateInitIssue?: string | null;
  forkedFromProjectId?: number | null;
}

export type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER';

export interface ClarifyingQuestion {
  id: string;
  question: string;
  helper?: string | null;
  options: string[];
  multiSelect: boolean;
}

export interface IdeaInterview {
  questions: ClarifyingQuestion[];
  /** False when the AI could not be reached and these are the fixed general questions, not ones written for the idea. */
  tailored: boolean;
}

export interface IdeaAnswer {
  questionId: string;
  question: string;
  answers: string[];
}

export interface ProjectMember {
  userId: number;
  username: string;
  name?: string;
  role: ProjectRole;
  invitedAt?: string;
}

export interface ProjectMemberEntry {
  userId?: number | null;
  inviteId?: number | null;
  username: string;
  name?: string | null;
  role: ProjectRole;
  invitedAt?: string | null;
  acceptedAt?: string | null;
}

export interface PendingInvite {
  inviteId: number;
  email: string;
  role: ProjectRole;
  invitedAt?: string;
}

export interface ProjectInvitation {
  projectId: number;
  projectName: string;
  role: ProjectRole;
  invitedByName: string | null;
  invitedAt: string;
}

export interface CodeSearchMatch {
  line: number;
  text: string;
  column: number;
  length: number;
}

export interface CodeSearchFileResult {
  path: string;
  matches: CodeSearchMatch[];
  truncated: boolean;
}

export interface CodeSearchResponse {
  query: string;
  fileCount: number;
  matchCount: number;
  truncated: boolean;
  files: CodeSearchFileResult[];
  unavailablePaths: string[];
}

export interface CodeSelection {
  path: string;
  code: string;
  startLine: number;
  endLine: number;
}

export interface CodeNote {
  id: number;
  question: string;
  answer: string;
  selection?: CodeSelection | null;
  createdAt?: string;
}

export interface ProjectTour {
  content: string;
  writtenAt?: string;
}

export interface GlossaryEntry {
  id: number;
  term: string;
  definition: string;
  createdAt?: string;
}

export interface Plan {
  id: number | null;
  name: string;
  tagline?: string | null;
  maxProjects: number | null;
  maxTokensPerDay: number | null;
  maxPreviews?: number | null;
  unlimitedAi?: boolean | null;
  price: string;
  priceAmountMinor: number | null;
  currency: string | null;
  billingInterval: string | null;
  isFree: boolean;
}

export type SubscriptionStatus =
  | "ACTIVE"
  | "TRIALING"
  | "PAST_DUE"
  | "CANCELED"
  | "INCOMPLETE"
  | "UNPAID"
  | "PAUSED";

export interface Subscription {
  plan: Plan;
  status: SubscriptionStatus | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  isFree: boolean;
  /** True when a plan-change reached Stripe but the read-back to confirm it locally failed - treat as provisional. */
  syncPending?: boolean;
}

export interface UsageToday {
  tokensUsed: number;
  tokensLimit: number;
  previewsRunning: number;
  previewsLimit: number;
  projectsUsed: number;
  projectsLimit: number;
  resetsAt: string;
  planName: string;
  projectTokensToday?: number | null;
  lastRequest?: LastRequestUsage | null;
  buildMinimumTokens?: number | null;
}

export type UsageFeature = "BUILD" | "BUILD_RETRY" | "EXPLAIN" | "IDEA_INTERVIEW" | "PROJECT_NAMING" | "SUGGEST" | "UNATTRIBUTED";

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

export interface QuotaDetails {
  reason: "DAILY_TOKENS" | "PROJECT_LIMIT" | "PREVIEW_LIMIT" | "PUBLISH_LIMIT";
  limit: number;
  used: number;
  resetsAt?: string | null;
  planName: string;
}

export interface SessionResponse {
  user: { id: number; username: string; name: string };
  expiresAt: string;
  newAccount: boolean;
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

export interface ActiveGeneration {
  userMessage: string;
  startedAt: string;
  status: "RUNNING" | "SAVING" | "FINISHED";
}
