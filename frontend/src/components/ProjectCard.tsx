import { useEffect, useRef, useState } from "react";
import { deleteCopy } from "@/lib/project-delete";
import { formatDistanceToNow } from "date-fns";
import { Download, GitFork, MoreHorizontal, Pencil, Pin, PinOff, Star, StarOff, Trash2 } from "lucide-react";
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
    /** Only offered to editors of someone else's project. */
    onFork?: () => void;
    onTogglePin: () => void;
    onToggleStar: () => void;
    /** Renaming is optional: a caller that doesn't wire these up just doesn't get the menu item. */
    isRenaming?: boolean;
    onStartRename?: () => void;
    /** `null` means cancelled - nothing is renamed either way. */
    onRenameDone?: (name: string | null) => void;
}

const ROLE_LABELS: Record<ProjectRole, string> = { OWNER: "Owner", EDITOR: "Editor", VIEWER: "Viewer" };

const editedAgo = (project: ProjectSummaryResponse) =>
    formatDistanceToNow(new Date(project.updatedAt ?? project.createdAt), { addSuffix: true });

/** Inline rename in place of the name: Enter or clicking away saves, Escape cancels. Stops clicks reaching the card underneath. */
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
                "min-w-0 flex-1 rounded-md border border-primary/50 bg-background px-1.5 py-0.5 text-sm text-foreground caret-primary outline-none ring-[3px] ring-primary/15",
                className
            )}
        />
    );
}

function ProjectActionsMenu({ project, onDownload, onDelete, onFork, onTogglePin, onToggleStar, isRenaming, onStartRename }: Omit<ProjectItemProps, "onOpen" | "onRenameDone">) {
    // Same access this project's other management actions (delete) already use.
    const canManage = project.role === "OWNER" || project.role === "EDITOR";

    return (
        // Non-modal: a modal menu that opens a dialog leaves the page unclickable after it closes
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button
                    type="button"
                    aria-label={`Actions for ${project.name}`}
                    className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[opacity,background-color,color] hover:bg-muted/60 hover:text-primary focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:bg-primary/15 data-[state=open]:text-primary data-[state=open]:opacity-100 md:opacity-0",
                        isRenaming && "hidden"
                    )}
                >
                    <MoreHorizontal className="h-4 w-4" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                {canManage && onStartRename && (
                    <>
                        <DropdownMenuItem onClick={onStartRename}>
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
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive [&_svg]:text-destructive [&[data-highlighted]_svg]:text-destructive"
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

/** Small pin/star marks shown next to a project's name. */
function PreferenceMarks({ project }: { project: ProjectSummaryResponse }) {
    if (!project.pinnedAt && !project.starredAt) return null;
    return (
        <span className="flex shrink-0 items-center gap-1 text-primary">
            {project.pinnedAt && <Pin aria-label="Pinned" className="h-3 w-3" />}
            {project.starredAt && <Star aria-label="Starred" className="h-3 w-3 fill-current" />}
        </span>
    );
}

const openOnEnter = (onOpen: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onOpen();
};

export function ProjectCard({ onOpen, thumbnailClassName, isRenaming, onRenameDone, ...props }: ProjectItemProps & { thumbnailClassName?: string }) {
    const { project } = props;
    return (
        <div
            role={isRenaming ? undefined : "link"}
            tabIndex={isRenaming ? undefined : 0}
            onClick={isRenaming ? undefined : onOpen}
            onKeyDown={isRenaming ? undefined : openOnEnter(onOpen)}
            className={cn(
                "group flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card transition-[border-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isRenaming
                    ? "border-primary/50"
                    : "cursor-pointer hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_14px_32px_-16px_hsl(var(--primary)/0.5)]"
            )}
        >
            <div className={cn("relative aspect-[16/9] overflow-hidden border-b border-border/60", thumbnailClassName)}>
                <div
                    className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
                    style={generateGradient(project.name)}
                />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.14),transparent_55%)]" />
                {project.role && project.role !== "OWNER" && (
                    <span className="absolute left-2.5 top-2.5 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/90 backdrop-blur">
                        {ROLE_LABELS[project.role]}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5">
                <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white ring-1 ring-inset ring-white/15"
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
                                <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">{project.name}</p>
                                <PreferenceMarks project={project} />
                            </>
                        )}
                    </div>
                    {!isRenaming && <p className="truncate text-xs text-muted-foreground">Edited {editedAgo(project)}</p>}
                </div>
                <ProjectActionsMenu {...props} isRenaming={isRenaming} />
            </div>
        </div>
    );
}

export function ProjectRow({ onOpen, isRenaming, onRenameDone, ...props }: ProjectItemProps) {
    const { project } = props;
    return (
        <div
            role={isRenaming ? undefined : "link"}
            tabIndex={isRenaming ? undefined : 0}
            onClick={isRenaming ? undefined : onOpen}
            onKeyDown={isRenaming ? undefined : openOnEnter(onOpen)}
            className={cn(
                "group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isRenaming ? "border-primary/50 bg-muted/20" : "cursor-pointer border-transparent hover:border-border/70 hover:bg-muted/40"
            )}
        >
            <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white ring-1 ring-inset ring-white/15"
                style={generateGradient(project.name)}
            >
                {project.name.charAt(0).toUpperCase()}
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {isRenaming ? (
                    <RenameNameField project={project} onDone={onRenameDone!} />
                ) : (
                    <>
                        <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">{project.name}</p>
                        <PreferenceMarks project={project} />
                    </>
                )}
            </div>
            <span className={cn("hidden w-24 text-xs sm:block", project.role === "OWNER" ? "text-primary" : "text-muted-foreground")}>
                {project.role ? ROLE_LABELS[project.role] : ""}
            </span>
            <span className="hidden w-40 text-xs text-muted-foreground md:block">Edited {editedAgo(project)}</span>
            <ProjectActionsMenu {...props} isRenaming={isRenaming} />
        </div>
    );
}
