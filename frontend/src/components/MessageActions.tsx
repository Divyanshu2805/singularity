import { useEffect, useRef, useState } from "react";
import { Check, Copy, Pencil, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const COPY_FEEDBACK_MS = 1500;

/** "Today at 8:29 PM" for something recent, a date once it isn't today. */
export function formatMessageTime(iso?: string): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;

  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  const isSameDay = at.toDateString() === today.toDateString();
  if (isSameDay) return `Today at ${time}`;

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (at.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;

  const sameYear = at.getFullYear() === today.getFullYear();
  const date = at.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${date} at ${time}`;
}

/**
 * The timestamp and hover actions under a message.
 *
 * <p>Always rendered, kept invisible until the message is hovered or something inside it has focus - so the
 * transcript stays quiet to read, but the controls are never more than a hover away and are still reachable
 * by keyboard. The parent needs `group/message` for the hover to reach here.
 */
export function MessageActions({ at, onCopy, onEdit, onDelete, deleteLabel = "Delete", align = "left", className }: {
  at?: string;
  /** Returns the text to put on the clipboard. Omit to leave out the copy button. */
  onCopy?: () => string;
  /** Omit for messages that can't be edited (anything the AI said). */
  onEdit?: () => void;
  /**
   * Omit wherever a message can't be removed - the project transcript is the record of what was actually
   * built and has no delete path, so only the code notes pass this.
   */
  onDelete?: () => void;
  deleteLabel?: string;
  align?: "left" | "right";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<number>();

  useEffect(() => () => window.clearTimeout(resetRef.current), []);

  const copy = async () => {
    if (!onCopy) return;
    try {
      await navigator.clipboard.writeText(onCopy());
      window.clearTimeout(resetRef.current);
      setCopied(true);
      resetRef.current = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard access can be refused; the message itself is still selectable.
    }
  };

  const time = formatMessageTime(at);
  if (!time && !onCopy && !onEdit && !onDelete) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1 pt-1 text-[10px] text-muted-foreground/70",
        "opacity-0 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100",
        // The copied tick has to stay visible after the pointer moves away, or the feedback is missed.
        copied && "opacity-100",
        align === "right" && "justify-end",
        className
      )}
    >
      {time && <span className="tabular-nums">{time}</span>}
      {onCopy && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={copied ? "Copied" : "Copy message"}
              onClick={copy}
              className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-muted/60 hover:text-primary focus-visible:opacity-100"
            >
              {copied ? <Check className="h-3 w-3 text-syntax-string" /> : <Copy className="h-3 w-3" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{copied ? "Copied" : "Copy"}</TooltipContent>
        </Tooltip>
      )}
      {onEdit && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Edit and resend"
              onClick={onEdit}
              className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-muted/60 hover:text-primary focus-visible:opacity-100"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Edit &amp; resend</TooltipContent>
        </Tooltip>
      )}
      {onDelete && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={deleteLabel}
              onClick={onDelete}
              className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:opacity-100"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{deleteLabel}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
