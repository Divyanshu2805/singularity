/**
 * The card every box of the Settings page is drawn in.
 *
 * Handles: a raised card with a gold-tinted icon tile, a mono label, a title and a line of description across its
 * head, an optional action on the head's right, and a body set in a recessed well under a hairline; and a danger
 * tone for the one box that cannot be undone. The card rises in turn with its neighbours (--i) and keeps scroll-mt
 * so an address ending in its id lands with the head in view.
 *
 * The look - the gold hairline along the top, the tile, the well, the hover - lives in index.css (.settings-card,
 * .settings-tile, .settings-well); the page's boxes and the security boxes (SecuritySections) all use this one card, so
 * they cannot drift apart. A card with no body is just its head.
 */
import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsCard({ id, index, label, title, Icon, description, action, tone, bodyClassName, children }: {
  id?: string;
  index: number;
  label: string;
  title: ReactNode;
  Icon: LucideIcon;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "danger";
  bodyClassName?: string;
  children?: ReactNode;
}) {
  return (
    <section
      id={id}
      data-tone={tone}
      className="app-glass settings-card app-rise scroll-mt-4 rounded-[22px]"
      style={{ "--i": index } as CSSProperties}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 p-5 sm:p-6">
        <span aria-hidden="true" className="settings-tile">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <p className="app-label">{label}</p>
          <h2 className="mt-1 text-[17px] font-semibold leading-snug tracking-tight">{title}</h2>
          {description && <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center self-center">{action}</div>}
      </div>
      {children && <div className={cn("settings-well px-5 py-5 sm:px-6", bodyClassName)}>{children}</div>}
    </section>
  );
}
