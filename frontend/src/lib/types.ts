/**
 * The shapes the backend actually returns, as the app sees them.
 *
 * Handles: projects and their members, files and search results, previews, chat messages and events, code notes and
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
}

export interface PreviewLogs {
  log: string | null;
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
  TODO = 'TODO',
  FILE_EDIT = 'FILE_EDIT',
  FILE_DELETE = 'FILE_DELETE',
  LEARN = 'LEARN',
  TOOL_LOG = 'TOOL_LOG'
}

export interface ChatEvent {
  id?: number;
  type: ChatEventType;
  content: string;
  metadata?: string;
  filePath?: string;
  sequenceOrder?: number;
  isComplete?: boolean;
}

export interface ChatMessage {
  id: number;
  role: 'USER' | 'ASSISTANT';
  content?: string;
  events: ChatEvent[];
  createdAt?: string;
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

export interface ProjectRequest {
  name: string;
}

export type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER';

export interface ClarifyingQuestion {
  id: string;
  question: string;
  helper?: string | null;
  options: string[];
  multiSelect: boolean;
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

export interface InviteMemberRequest {
  username: string;
  role: ProjectRole;
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
  reason: "DAILY_TOKENS" | "PROJECT_LIMIT" | "PREVIEW_LIMIT";
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
  teachingMode: boolean;
  status: "RUNNING" | "SAVING";
}
