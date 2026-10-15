/**
 * A keyboard key drawn as a small sunken cap, for the hints under the prompts.
 *
 * Handles: the one look of a key (index.css, .sidebar-kbd) shared by the project chat's hint and the dashboard's prompt,
 * so "Enter send · Shift Enter new line" reads the same everywhere.
 */
import type { ReactNode } from "react";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="sidebar-kbd inline-flex h-[18px] items-center px-1 font-sans text-[10px] font-medium leading-none text-foreground/80">
      {children}
    </kbd>
  );
}
