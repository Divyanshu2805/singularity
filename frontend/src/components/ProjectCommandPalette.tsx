import { useMemo, type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { LayoutDashboard, LayoutGrid, Pin, Plus, Star, type LucideIcon } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { byLastEdited } from "@/lib/project-filters";
import type { ProjectSummaryResponse } from "@/lib/types";
import { cn, generateGradient } from "@/lib/utils";

// Both spellings of the selected attribute, so these win over the base CommandItem's accent colours.
const ITEM_CLASS =
    "gap-3 rounded-md px-2.5 py-2 text-[13px] text-foreground data-[selected='true']:bg-primary/15 data-[selected=true]:text-primary";

const JUMPS: { label: string; path: string; Icon: LucideIcon; keywords: string[] }[] = [
    { label: "New project", path: "/projects?new=1", Icon: Plus, keywords: ["create", "start", "idea"] },
    { label: "Dashboard", path: "/projects", Icon: LayoutDashboard, keywords: ["home"] },
    { label: "All projects", path: "/projects/all", Icon: LayoutGrid, keywords: ["browse", "list"] },
    { label: "Pinned projects", path: "/projects/all?filter=pinned", Icon: Pin, keywords: ["pins"] },
    { label: "Starred projects", path: "/projects/all?filter=starred", Icon: Star, keywords: ["favorites", "stars"] },
];

function Kbd({ children }: { children: ReactNode }) {
    return (
        <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/80 bg-muted/40 px-1 font-mono text-[10px] text-muted-foreground">
            {children}
        </kbd>
    );
}

/** Ctrl/⌘ K search: find a project by name, or jump straight to a page. */
export function ProjectCommandPalette({ open, onOpenChange, projects, onNavigate }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projects: ProjectSummaryResponse[];
    onNavigate: (path: string) => void;
}) {
    const sortedProjects = useMemo(() => [...projects].sort(byLastEdited), [projects]);

    const select = (path: string) => {
        onOpenChange(false);
        onNavigate(path);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl gap-0 overflow-hidden border-border/80 bg-card p-0 shadow-2xl shadow-black/60 [&>button]:hidden">
                <DialogTitle className="sr-only">Search projects</DialogTitle>
                <DialogDescription className="sr-only">Find a project by name, or jump to a page.</DialogDescription>
                <Command className="bg-card [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground/70">
                    <CommandInput placeholder="Search projects or jump to a page…" className="h-12 caret-primary" />
                    <CommandList className="max-h-[360px] p-1.5">
                        <CommandEmpty className="py-10 text-center text-sm text-muted-foreground">Nothing matches that.</CommandEmpty>

                        {sortedProjects.length > 0 && (
                            <CommandGroup heading="Projects">
                                {sortedProjects.map((project) => (
                                    <CommandItem
                                        key={project.id}
                                        // The id keeps projects with the same name distinct; cmdk filters on this value
                                        value={`${project.name} #${project.id}`}
                                        onSelect={() => select(`/projects/${project.id}`)}
                                        className={ITEM_CLASS}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="h-5 w-5 shrink-0 rounded ring-1 ring-inset ring-white/10"
                                            style={generateGradient(project.name)}
                                        />
                                        <span className="min-w-0 flex-1 truncate">{project.name}</span>
                                        {project.pinnedAt && <Pin aria-label="Pinned" className="h-3.5 w-3.5 shrink-0 text-primary/80" />}
                                        {project.starredAt && <Star aria-label="Starred" className="h-3.5 w-3.5 shrink-0 fill-current text-primary/80" />}
                                        <span className="shrink-0 text-[11px] text-muted-foreground">
                                            {formatDistanceToNow(new Date(project.updatedAt ?? project.createdAt), { addSuffix: true })}
                                        </span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}

                        <CommandSeparator className="mx-1 my-1" />

                        <CommandGroup heading="Go to">
                            {JUMPS.map(({ label, path, Icon, keywords }) => (
                                <CommandItem key={path} value={label} keywords={keywords} onSelect={() => select(path)} className={ITEM_CLASS}>
                                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    {label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>

                    <div className="flex items-center gap-4 border-t border-border/60 bg-panel/60 px-3 py-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <Kbd>↑</Kbd>
                            <Kbd>↓</Kbd>
                            navigate
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Kbd>↵</Kbd>
                            open
                        </span>
                        <span className={cn("ml-auto flex items-center gap-1.5")}>
                            <Kbd>esc</Kbd>
                            close
                        </span>
                    </div>
                </Command>
            </DialogContent>
        </Dialog>
    );
}
