/**
 * One project, as a card on the dashboard or as a row in a list.
 *
 * Handles: the name with inline renaming, the generated gradient thumbnail, the last-edited time, the caller's role,
 * and the actions menu - pin, star, fork, delete.
 *
 * The card and the row share one hover: the app's gold wash, never a lit border. On the card it fades in across the
 * foot (index.css, .card-foot) with a soft glare under the pointer and a slight tilt towards it
 * (motion.ts's tiltToPointer - a mouse only, and never under reduced motion); its thumbnail eases in a little closer
 * while its colours drift (.card-thumb), and a round arrow fades in at the thumbnail's corner (.card-open). The card
 * used to answer with a gold hairline all the way round and an ember glow beneath, and its name turned gold. On the
 * row (the list form, pages/AllProjects.tsx) the wash is the list's gliding highlight (data-glide,
 * hooks/use-glide-highlight), which is why the row itself paints no hover background, and the arrow fades in beside
 * the name. On both, the tile swells and the dim text brightens (.proj-tile, .proj-name, .proj-meta), and nothing
 * shifts sideways; that nudge is the sidebar's alone. The same look holds while the item's menu is open.
 *
 * At rest the actions button is always in view but dim. The role is a small chip (.role-chip): on the row for
 * everyone, gold for an owner; on the card only for someone who is not the owner, set on the thumbnail over a dark
 * backing. Renaming holds the card still. A project that has just been deleted fades and shrinks away (isLeaving,
 * data-leaving) before the list drops it, rather than vanishing. The initial on its tile carries a faint shadow,
 * since the tile can be any hue and white on a yellow needs it.
 */
import { useEffect, useRef, useState } from "react";
import { releaseTilt, tiltToPointer } from "@/components/landing/motion";
import { deleteCopy } from "@/lib/project-delete";
import { formatDistanceToNow } from "date-fns";
import { ArrowUpRight, Download, GitFork, MoreHorizontal, Pencil, Pin, PinOff, Star, StarOff, Trash2 } from "lucide-react";
import { canForkProject } from "@/lib/project-fork";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectRole, ProjectSummaryResponse } from "@/lib/types";
import { cn, generateGradient } from "@/lib/utils";

export interface ProjectItemProps {
    project: ProjectSummaryResponse;
    onOpen: () => void;
    onDownload: () => void;
    onDelete: () => void;
    onFork?: () => void;
    onTogglePin: () => void;
    onToggleStar: () => void;
    isRenaming?: boolean;
    isLeaving?: boolean;
    onStartRename?: () => void;
    onRenameDone?: (name: string | null) => void;
}

const ROLE_LABELS: Record<ProjectRole, string> = { OWNER: "Owner", EDITOR: "Editor", VIEWER: "Viewer" };

const editedAgo = (project: ProjectSummaryResponse) =>
    formatDistanceToNow(new Date(project.updatedAt ?? project.createdAt), { addSuffix: true });

function RenameNameField({ project, onDone, className }: {
    project: ProjectSummaryResponse;
    onDone: (name: string | null) => void;
    className?: string;
}) {
    const [draft, setDraft] = useState(project.name);
    const inputRef = useRef<HTMLInputElement>(null);
    const isDoneRef = useRef(false);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const finish = (save: boolean) => {
        if (isDoneRef.current) return;
        isDoneRef.current = true;
        const next = draft.trim();
        onDone(save && next && next !== project.name ? next : null);
    };

    return (
        <input
            ref={inputRef}
            value={draft}
            maxLength={255}
            aria-label={`Rename ${project.name}`}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => finish(true)}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    finish(true);
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    finish(false);
                }
            }}
            className={cn(
                "min-w-0 flex-1 rounded-md border border-primary/50 bg-[hsl(30_11%_3%)] px-1.5 py-0.5 text-sm text-foreground caret-primary outline-none ring-[3px] ring-primary/[0.12]",
                className
            )}
        />
    );
}

function ProjectActionsMenu({ project, onDownload, onDelete, onFork, onTogglePin, onToggleStar, isRenaming, onStartRename }: Omit<ProjectItemProps, "onOpen" | "onRenameDone">) {
    const canManage = project.role === "OWNER" || project.role === "EDITOR";
    const pendingRenameRef = useRef(false);
    const beginPendingRename = () => {
        if (!pendingRenameRef.current) return;
        pendingRenameRef.current = false;
        onStartRename?.();
    };

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button
                    type="button"
                    aria-label={`Actions for ${project.name}`}
                    className={cn(
                        "icon-btn h-7 w-7 opacity-60 transition-[opacity,background-color,color] focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:text-foreground data-[state=open]:opacity-100",
                        isRenaming && "hidden"
                    )}
                >
                    <MoreHorizontal className="h-4 w-4" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onCloseAutoFocus={(e) => {
                    if (!pendingRenameRef.current) return;
                    e.preventDefault();
                    beginPendingRename();
                }}
            >
                {canManage && onStartRename && (
                    <>
                        <DropdownMenuItem
                            onSelect={() => {
                                pendingRenameRef.current = true;
                                window.setTimeout(beginPendingRename, 400);
                            }}
                        >
                            <Pencil />
                            Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                    </>
                )}
                <DropdownMenuItem onClick={onTogglePin}>
                    {project.pinnedAt ? <PinOff /> : <Pin />}
                    {project.pinnedAt ? "Unpin" : "Pin to sidebar"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onToggleStar}>
                    {project.starredAt ? <StarOff /> : <Star />}
                    {project.starredAt ? "Remove star" : "Star"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDownload}>
                    <Download />
                    Download ZIP
                </DropdownMenuItem>
                {onFork && canForkProject(project.role) && (
                    <DropdownMenuItem onClick={onFork}>
                        <GitFork />
                        Fork project
                    </DropdownMenuItem>
                )}
                {canManage && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={onDelete}
                            data-danger="delete"
                        >
                            <Trash2 />
                            {deleteCopy(project.role, project.name).menuLabel}
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function PreferenceMarks({ project }: { project: ProjectSummaryResponse }) {
    if (!project.pinnedAt && !project.starredAt) return null;
    return (
        <span className="flex shrink-0 items-center gap-1 text-primary">
            {project.pinnedAt && <Pin aria-label="Pinned" className="pin-active h-3 w-3" />}
            {project.starredAt && <Star aria-label="Starred" className="h-3 w-3 fill-current" />}
        </span>
    );
}

const openOnEnter = (onOpen: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onOpen();
};

export function ProjectCard({ onOpen, thumbnailClassName, isRenaming, isLeaving, onRenameDone, ...props }: ProjectItemProps & { thumbnailClassName?: string }) {
    const { project } = props;
    return (
        <div
            role={isRenaming ? undefined : "link"}
            tabIndex={isRenaming ? undefined : 0}
            onClick={isRenaming ? undefined : onOpen}
            onKeyDown={isRenaming ? undefined : openOnEnter(onOpen)}
            onPointerMove={isRenaming ? undefined : (e) => tiltToPointer(e, 3)}
            onPointerLeave={releaseTilt}
            data-interactive={!isRenaming}
            data-leaving={isLeaving || undefined}
            className={cn(
                "app-card group flex flex-col overflow-hidden rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isRenaming ? "border-primary/50" : "cursor-pointer"
            )}
        >
            <span aria-hidden="true" className="app-card-glare" />
            <div className={cn("relative aspect-[16/9] overflow-hidden border-b border-white/[0.06]", thumbnailClassName)}>
                <div
                    className="card-thumb absolute inset-0 group-hover:scale-[1.06]"
                    style={generateGradient(project.name)}
                />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.14),transparent_55%)]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[hsl(30_11%_3.7%/0.6)] via-transparent to-transparent" />
                {project.role && project.role !== "OWNER" && (
                    <span className="role-chip absolute left-2.5 top-2.5" data-on="thumb">
                        {ROLE_LABELS[project.role]}
                    </span>
                )}
                {!isRenaming && (
                    <span aria-hidden="true" className="card-open">
                        <ArrowUpRight className="no-icon-anim h-3.5 w-3.5" />
                    </span>
                )}
            </div>
            <div className="card-foot relative flex items-center gap-3 px-3 py-3">
                <span
                    aria-hidden="true"
                    className="proj-tile flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white ring-1 ring-inset ring-white/15 [text-shadow:0_1px_2px_rgb(0_0_0/0.45)]"
                    style={generateGradient(project.name)}
                >
                    {project.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                        {isRenaming ? (
                            <RenameNameField project={project} onDone={onRenameDone!} />
                        ) : (
                            <>
                                <p className="proj-name truncate text-sm font-medium">{project.name}</p>
                                <PreferenceMarks project={project} />
                            </>
                        )}
                    </div>
                    {!isRenaming && <p className="proj-meta mt-0.5 truncate text-xs">Edited {editedAgo(project)}</p>}
                </div>
                <ProjectActionsMenu {...props} isRenaming={isRenaming} />
            </div>
        </div>
    );
}

export function ProjectRow({ onOpen, isRenaming, isLeaving, onRenameDone, ...props }: ProjectItemProps) {
    const { project } = props;
    return (
        <div
            role={isRenaming ? undefined : "link"}
            tabIndex={isRenaming ? undefined : 0}
            onClick={isRenaming ? undefined : onOpen}
            onKeyDown={isRenaming ? undefined : openOnEnter(onOpen)}
            data-glide={isRenaming ? undefined : ""}
            data-leaving={isLeaving || undefined}
            className={cn(
                "project-row group relative flex items-center gap-3.5 rounded-xl border px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
                isRenaming ? "border-primary/50 bg-white/[0.03]" : "cursor-pointer border-transparent"
            )}
        >
            <span
                aria-hidden="true"
                className="proj-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-sm font-semibold text-white ring-1 ring-inset ring-white/15 [text-shadow:0_1px_2px_rgb(0_0_0/0.45)]"
                style={generateGradient(project.name)}
            >
                {project.name.charAt(0).toUpperCase()}
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-2">
                {isRenaming ? (
                    <RenameNameField project={project} onDone={onRenameDone!} />
                ) : (
                    <>
                        <p className="proj-name truncate text-sm font-medium">{project.name}</p>
                        <PreferenceMarks project={project} />
                        <ArrowUpRight aria-hidden="true" className="proj-arrow no-icon-anim h-3.5 w-3.5 shrink-0" />
                    </>
                )}
            </div>
            <span className="hidden w-28 sm:block">
                {project.role && (
                    <span className="role-chip" data-role={project.role.toLowerCase()}>
                        {ROLE_LABELS[project.role]}
                    </span>
                )}
            </span>
            <span className="proj-meta hidden w-44 truncate text-[13px] md:block">{editedAgo(project)}</span>
            <ProjectActionsMenu {...props} isRenaming={isRenaming} />
        </div>
    );
}
