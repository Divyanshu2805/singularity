/**
 * The dashboard's word that someone has invited the signed-in person to a project.
 *
 * Handles: showing one toast when the dashboard opens with an invitation the person has not yet been told about. For a
 * single invitation it says who invited them to do what on which project, and carries Accept and Decline, answered
 * through hooks/use-invitations exactly as in the Project invites panel (accepting opens the project). For several it
 * says how many are waiting and carries one View button, which opens that panel (OPEN_INVITES_EVENT, answered by the
 * sidebar). The toast stays five seconds (the others three), the draining line along its foot
 * running for the same five (--toast-ms, index.css) and not holding when the pointer is on it. Answering it, crossing it out or
 * letting it go only puts it away - an unanswered invitation stays pending, in the panel and in the sidebar's count. Each invitation is announced once, ever: the ids already announced are remembered in this browser, per
 * person, so a reload, another visit to the dashboard or signing out and in says nothing more about it, and from then on
 * it is found only under Project invites (and in the sidebar's count).
 *
 * The record is deliberately not cleared on sign-out - clearing it would announce the same invitation again at the next
 * sign-in. It is keyed by the person's id, so another account on the same browser has its own, and holds project ids only.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { getUserInfo } from "@/lib/api";
import { useInvitations, type Invitations } from "@/hooks/use-invitations";
import { OPEN_INVITES_EVENT } from "@/lib/invitations-event";
import { roleOffer } from "@/lib/members";
import type { ProjectInvitation } from "@/lib/types";

const NOTICE_MS = 5000;

function announcedKey() {
  const user = getUserInfo();
  return user ? `announced_invites:${user.id}` : null;
}

function readAnnounced(): Set<number> {
  try {
    const key = announcedKey();
    const raw = key ? localStorage.getItem(key) : null;
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((id): id is number => typeof id === "number") : []);
  } catch {
    return new Set();
  }
}

function writeAnnounced(ids: Set<number>) {
  try {
    const key = announcedKey();
    if (key) localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
  }
}

const QUIET_BUTTON = "border-white/[0.08] bg-white/[0.06] text-foreground/90 hover:bg-white/[0.12]";

function invitationText(invitation: ProjectInvitation) {
  const what = `${roleOffer(invitation.role)} “${invitation.projectName}”`;
  if (!invitation.invitedByName) return <>You've been invited to {what}.</>;
  return (
    <>
      <span className="font-medium text-foreground">{invitation.invitedByName}</span> invited you to {what}.
    </>
  );
}

export function InvitationNotice() {
  const { invitations, answer } = useInvitations();
  const answerRef = useRef<Invitations["answer"]>(answer);
  answerRef.current = answer;

  useEffect(() => {
    const announced = readAnnounced();
    const fresh = invitations.filter((invitation) => !announced.has(invitation.projectId));
    if (fresh.length === 0) return;
    fresh.forEach((invitation) => announced.add(invitation.projectId));
    writeAnnounced(announced);

    const only = invitations.length === 1 ? invitations[0] : null;
    toast({
      title: only ? "Project invitation" : `${invitations.length} project invitations`,
      description: only ? invitationText(only) : "You have been invited to collaborate. Review them to accept or decline.",
      duration: NOTICE_MS,
      style: { "--toast-ms": `${NOTICE_MS}ms` } as CSSProperties,
      action: only ? (
        <>
          <ToastAction altText={`Accept the invitation to ${only.projectName}`} onClick={() => void answerRef.current(only, true)}>
            Accept
          </ToastAction>
          <ToastAction altText={`Decline the invitation to ${only.projectName}`} className={QUIET_BUTTON} onClick={() => void answerRef.current(only, false)}>
            Decline
          </ToastAction>
        </>
      ) : (
        <ToastAction altText="View your project invitations" onClick={() => window.dispatchEvent(new Event(OPEN_INVITES_EVENT))}>
          View invitations
        </ToastAction>
      ),
    });
  }, [invitations]);

  return null;
}
