/**
 * The keyboard search: find a project by name, or jump straight to a page.
 *
 * Handles: the list of projects (most recently edited first) and the pages to jump to, filtering both as the visitor
 * types, and going to whichever is chosen.
 *
 * It opens a little above the middle of the screen and stays pinned there, so the box does not jump about as the list
 * under it grows and shrinks; the list's height eases between sizes instead (index.css, .cmd-palette). The box drops
 * in from just above with a slight grow, and on opening its rows rise in one after another - only then (fresh), never
 * while typing, where rows arriving late would make the filter feel slow. The row under the keyboard or the pointer
 * behaves as a menu's item does: the app's one gold wash glides to it from the row it was on (lib/menu-glide), its
 * icon tile lights and its return-key hint slides in (.cmd-item). The page or project already open is marked in
 * white and gold (data-current), so the list shows where you are as well as where you can go. The line between the
 * two groups is drawn only when there are projects above it: with none it sat alone under the search box.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { CornerDownLeft, LayoutDashboard, LayoutGrid, Pin, Plus, Star, type LucideIcon } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { byLastEdited } from "@/lib/project-filters";
import type { ProjectSummaryResponse } from "@/lib/types";
import { generateGradient } from "@/lib/utils";

const FRESH_MS = 700;
const MAX_STAGGER = 9;

const ITEM_CLASS = "cmd-item data-[selected='true']:bg-transparent data-[selected=true]:text-white";

const JUMPS: { label: string; path: string; Icon: LucideIcon; keywords: string[] }[] = [
    { label: "New project", path: "/projects?new=1", Icon: Plus, keywords: ["create", "start", "idea"] },
    { label: "Dashboard", path: "/projects", Icon: LayoutDashboard, keywords: ["home"] },
    { label: "All projects", path: "/projects/all", Icon: LayoutGrid, keywords: ["browse", "list"] },
    { label: "Pinned projects", path: "/projects/all?filter=pinned", Icon: Pin, keywords: ["pins"] },
    { label: "Starred projects", path: "/projects/all?filter=starred", Icon: Star, keywords: ["favorites", "stars"] },
];

function order(index: number): CSSProperties {
    return { "--i": Math.min(index, MAX_STAGGER) } as CSSProperties;
}

function Kbd({ children }: { children: ReactNode }) {
    return (
        <kbd className="sidebar-kbd inline-flex h-5 min-w-5 items-center justify-center px-1 font-mono text-[10px] text-muted-foreground">
            {children}
        </kbd>
    );
}

export function ProjectCommandPalette({ open, onOpenChange, projects, onNavigate }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projects: ProjectSummaryResponse[];
    onNavigate: (path: string) => void;
}) {
    const sortedProjects = useMemo(() => [...projects].sort(byLastEdited), [projects]);
    const [fresh, setFresh] = useState(false);
    const { pathname, search } = useLocation();
    const here = `${pathname}${search}`;

    useEffect(() => {
        if (!open) return;
        setFresh(true);
        const timer = window.setTimeout(() => setFresh(false), FRESH_MS);
        return () => window.clearTimeout(timer);
    }, [open]);

    const select = (path: string) => {
        onOpenChange(false);
        onNavigate(path);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent data-fresh={fresh} className="cmd-palette top-[16vh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 [&>button]:hidden">
                <DialogTitle className="sr-only">Search projects</DialogTitle>
                <DialogDescription className="sr-only">Find a project by name, or jump to a page.</DialogDescription>
                <Command className="bg-transparent">
                    <CommandInput placeholder="Search projects or jump to a page…" className="h-[3.25rem] text-[15px] caret-primary placeholder:text-muted-foreground/70" />
                    <CommandList className="max-h-[360px]">
                        <CommandEmpty className="py-10 text-center text-sm text-muted-foreground">Nothing matches that.</CommandEmpty>

                        {sortedProjects.length > 0 && (
                            <CommandGroup heading="Projects" className="p-0">
                                {sortedProjects.map((project, index) => (
                                    <CommandItem
                                        key={project.id}
                                        value={`${project.name} #${project.id}`}
                                        onSelect={() => select(`/projects/${project.id}`)}
                                        data-current={pathname === `/projects/${project.id}`}
                                        className={ITEM_CLASS}
                                        style={order(index)}
                                    >
                                        <span aria-hidden="true" className="cmd-swatch" style={generateGradient(project.name)} />
                                        <span className="min-w-0 flex-1 truncate">{project.name}</span>
                                        {project.pinnedAt && <Pin aria-label="Pinned" className="pin-active h-3.5 w-3.5 shrink-0" />}
                                        {project.starredAt && <Star aria-label="Starred" className="h-3.5 w-3.5 shrink-0 fill-current text-muted-foreground" />}
                                        <span className="shrink-0 text-[11px] text-muted-foreground">
                                            {formatDistanceToNow(new Date(project.updatedAt ?? project.createdAt), { addSuffix: true })}
                                        </span>
                                        <CornerDownLeft aria-hidden="true" className="cmd-enter" />
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}

                        {sortedProjects.length > 0 && <CommandSeparator className="mx-2 my-1.5 bg-white/[0.07]" />}

                        <CommandGroup heading="Go to" className="p-0">
                            {JUMPS.map(({ label, path, Icon, keywords }, index) => (
                                <CommandItem
                                    key={path}
                                    value={label}
                                    keywords={keywords}
                                    onSelect={() => select(path)}
                                    data-current={path === here}
                                    className={ITEM_CLASS}
                                    style={order(sortedProjects.length + index)}
                                >
                                    <span aria-hidden="true" className="cmd-icon">
                                        <Icon className="h-3.5 w-3.5" />
                                    </span>
                                    <span className="min-w-0 flex-1 truncate">{label}</span>
                                    <CornerDownLeft aria-hidden="true" className="cmd-enter" />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>

                    <div className="flex items-center gap-4 border-t border-white/[0.06] bg-black/20 px-4 py-2.5 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <Kbd>↑</Kbd>
                            <Kbd>↓</Kbd>
                            navigate
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Kbd>↵</Kbd>
                            open
                        </span>
                        <span className="ml-auto flex items-center gap-1.5">
                            <Kbd>esc</Kbd>
                            close
                        </span>
                    </div>
                </Command>
            </DialogContent>
        </Dialog>
    );
}
