/**
 * When to ask for the titles of a person's chat messages - the few words the chat's scroll rail lists each one by.
 *
 * Handles: deciding, from the conversation as it stands, whether to ask: the rail is shown (more than one message
 * sent), nothing is streaming, and at least one saved message of the person's has no title and has not been asked
 * about yet this session; and recording which messages were asked about, so a message the model gave nothing usable
 * for is not asked about again on every render. That record is user state, so it is cleared on sign-out.
 *
 * The server titles every untitled message of the caller's in one call, so one request covers them all; the rail
 * shows a message's first line (lib/chat-rail) until its title arrives.
 */
import { onSignOut } from "./session";

interface RailMessage {
  role: "user" | "assistant";
  serverId?: number;
  title?: string;
}

const asked = new Set<string>();
const key = (projectId: string, serverId: number) => `${projectId}:${serverId}`;

export function messagesToTitle(projectId: string, messages: readonly RailMessage[], isStreaming: boolean): number[] {
  if (!projectId || isStreaming) return [];
  const sent = messages.filter((message) => message.role === "user");
  if (sent.length < 2) return [];
  return sent
    .filter((message) => message.serverId !== undefined && !message.title && !asked.has(key(projectId, message.serverId)))
    .map((message) => message.serverId!);
}

export function markMessagesTitled(projectId: string, serverIds: readonly number[]) {
  serverIds.forEach((serverId) => asked.add(key(projectId, serverId)));
}

export function resetMessageTitleRequests() {
  asked.clear();
}

onSignOut(resetMessageTitleRequests);
