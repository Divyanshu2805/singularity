/**
 * A project's folder icon, in a colour of its own.
 *
 * Handles: drawing a filled folder whose hue comes from the project's name (projectHue), so each project keeps the same
 * colour wherever it is listed - the sidebar and the search palette - and two projects rarely share one. The project
 * that is open is drawn as an open folder.
 */
import { Folder, FolderOpen } from "lucide-react";
import { cn, projectHue } from "@/lib/utils";

export function ProjectFolderIcon({ name, isOpen, className }: { name: string; isOpen?: boolean; className?: string }) {
  const hue = projectHue(name);
  const Icon = isOpen ? FolderOpen : Folder;
  return (
    <Icon
      aria-hidden="true"
      strokeWidth={1.75}
      className={cn("shrink-0", className)}
      style={{ color: `hsl(${hue} 78% 66%)`, fill: `hsl(${hue} 78% 60% / 0.28)` }}
    />
  );
}
