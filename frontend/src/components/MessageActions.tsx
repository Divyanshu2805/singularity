/**
 * The actions that appear on a chat message on hover: copy it, and when it applies, retry the turn.
 *
 * Handles: the copy with its own tick-then-revert state, tangled up with the row's hover reveal, and the timestamp
 * beside them - a time for something today, a date once it is not.
 *
 * Its buttons are the app's icon buttons (index.css, .icon-btn), each icon with a small motion of its own.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Copy, Pencil, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const COPY_FEEDBACK_MS = 1500;

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

export function MessageActions({ at, onCopy, onEdit, onDelete, deleteLabel = "Delete", align = "left", className }: {
  at?: string;
  onCopy?: () => string;
  onEdit?: () => void;
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
    }
  };

  const time = formatMessageTime(at);
  if (!time && !onCopy && !onEdit && !onDelete) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1 pt-1 text-[10.5px] text-muted-foreground",
        "opacity-0 transition-opacity duration-300 focus-within:opacity-100 group-hover/message:opacity-100",
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
              style={{ "--icon-hover": "translateX(1px)" } as CSSProperties}
              className="icon-btn h-6 w-6 rounded-md focus-visible:opacity-100"
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
              style={{ "--icon-hover": "rotate(-14deg)" } as CSSProperties}
              className="icon-btn h-6 w-6 rounded-md focus-visible:opacity-100"
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
              style={{ "--icon-hover": "rotate(-10deg) scale(1.1)" } as CSSProperties}
              className="icon-btn icon-btn-danger h-6 w-6 rounded-md focus-visible:opacity-100"
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
