/**
 * The Share button, with collaborator avatars, plus its panel.
 *
 * Handles: listing members and their roles, inviting someone by email, changing a role and removing a member - with
 * the controls hidden for a caller who cannot manage members.
 *
 * The Share button is the app's quiet outline button (the people icon lifts on hover), and the panel is the app's
 * matte glass: a Fraunces heading, the invite email in the app's matte well with its access picker folded into it,
 * the owner marked by a quiet chip rather than a gold outline, and the people listed as the sidebar's rows are: one
 * gold wash glides down the list after the pointer (hooks/use-glide-highlight), the rows holding still under it as
 * a menu's items do. A row that is asking to confirm a removal keeps its own red tint and takes no wash. The list
 * and its wash are a component of their own (PeopleList) because the panel is not in the page until it opens: the
 * glide hook attaches when its container mounts, and called from the dialog itself it found no list and never did.
 * The access picker inside the email well is a bare trigger, not the app's SelectTrigger - that one is itself a field
 * well, and its fill showed as a dark block inside the email box. Its options take the app's menu highlight (the
 * gold wash with the label nudging right, index.css .menu-item-hl) in place of the flat grey box they had, and the
 * list opens on the raised menu surface so it stands off the panel beneath it.
 */
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, Link2, Lock, Mail, ShieldCheck, UserPlus, UserX } from "lucide-react";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, getUserInfo } from "@/lib/api";
import { ProjectMember, ProjectRole } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useGlideHighlight } from "@/hooks/use-glide-highlight";
import { cn, generateGradient } from "@/lib/utils";

interface ShareDialogProps {
    projectId: string;
    canManageMembers?: boolean;
}

const ROLE_LABELS: Record<ProjectRole, string> = { OWNER: "Owner", EDITOR: "Can edit", VIEWER: "Can view" };

const ROLE_OPTIONS: { value: Exclude<ProjectRole, "OWNER">; description: string }[] = [
    { value: "EDITOR", description: "Build with AI, edit, and delete the project" },
    { value: "VIEWER", description: "See the code only" },
];

const REMOVE_VALUE = "REMOVE";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const initialOf = (member: ProjectMember) => (member.name || member.username).charAt(0).toUpperCase();

function RoleOption({ value, description }: { value: Exclude<ProjectRole, "OWNER">; description: string }) {
    const [hovered, setHovered] = useState(false);
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const open = hovered;
    return (
        <>
            <SelectPrimitive.Item
                value={value}
                ref={(node) => {
                    if (node && open) {
                        const rect = node.getBoundingClientRect();
                        setAnchor((prev) => (prev && prev.top === rect.top && prev.right === rect.right ? prev : rect));
                    }
                }}
                onPointerEnter={() => setHovered(true)}
                onPointerLeave={() => setHovered(false)}
                className="menu-item-hl group relative flex cursor-pointer select-none items-center rounded-xl py-2 pl-9 pr-3 text-[13px] font-medium text-white/90 outline-none"
            >
                <span className="absolute left-3 top-1/2 flex h-3.5 w-3.5 -translate-y-1/2 items-center justify-center">
                    <SelectPrimitive.ItemIndicator>
                        <Check className="no-icon-anim h-3.5 w-3.5" />
                    </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{ROLE_LABELS[value]}</SelectPrimitive.ItemText>
            </SelectPrimitive.Item>
            {open && anchor &&
                createPortal(
                    <div
                        role="tooltip"
                        style={
                            window.innerWidth - anchor.right >= anchor.left
                                ? { position: "fixed", top: anchor.top + anchor.height / 2, left: anchor.right + 12, transform: "translateY(-50%)", zIndex: 1000 }
                                : { position: "fixed", top: anchor.top + anchor.height / 2, right: window.innerWidth - anchor.left + 12, transform: "translateY(-50%)", zIndex: 1000 }
                        }
                        className="app-menu app-menu-raised pointer-events-none max-w-[220px] rounded-xl border px-3 py-2 text-xs leading-5 text-[hsl(40_30%_92%)] animate-in fade-in-0"
                    >
                        {description}
                    </div>,
                    document.body,
                )}
        </>
    );
}

function PeopleList({ children }: { children: ReactNode }) {
    const listRef = useRef<HTMLDivElement>(null);
    const glideRef = useGlideHighlight(listRef);
    return (
        <div ref={listRef} className="relative overflow-hidden">
            <span ref={glideRef} aria-hidden="true" className="glide-pill" />
            <div className="max-h-60 overflow-y-auto">{children}</div>
        </div>
    );
}

export function ShareDialog({ projectId, canManageMembers = true }: ShareDialogProps) {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [members, setMembers] = useState<ProjectMember[]>([]);
    const [isLoadingMembers, setIsLoadingMembers] = useState(true);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [inviteRole, setInviteRole] = useState<Exclude<ProjectRole, "OWNER">>("EDITOR");
    const [isInviting, setIsInviting] = useState(false);
    const [isLinkCopied, setIsLinkCopied] = useState(false);
    const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);
    const [removingId, setRemovingId] = useState<number | null>(null);
    const inviteInputRef = useRef<HTMLInputElement>(null);
    const currentUserId = getUserInfo()?.id;

    const loadMembers = () =>
        api.getProjectMembers(projectId)
            .then(setMembers)
            .catch((error) => console.error("Failed to load members", error));

    useEffect(() => {
        let isCancelled = false;
        if (members.length === 0) setIsLoadingMembers(true);
        api.getProjectMembers(projectId)
            .then((data) => {
                if (!isCancelled) setMembers(data);
            })
            .catch((error) => console.error("Failed to load members", error))
            .finally(() => {
                if (!isCancelled) setIsLoadingMembers(false);
            });
        if (!isOpen) setConfirmRemoveId(null);
        return () => {
            isCancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, isOpen]);

    const sortedMembers = useMemo(
        () =>
            [...members].sort((a, b) => {
                const rank = (m: ProjectMember) => (m.role === "OWNER" ? 0 : m.userId === currentUserId ? 1 : 2);
                return rank(a) - rank(b) || (a.name || a.username).localeCompare(b.name || b.username);
            }),
        [members, currentUserId]
    );

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setIsLinkCopied(true);
            window.setTimeout(() => setIsLinkCopied(false), 2000);
        } catch {
            toast({ title: "Couldn't copy the link", variant: "destructive" });
        }
    };

    const handleInvite = async () => {
        const email = inviteEmail.trim();
        if (!email || isInviting) return;
        if (!EMAIL_PATTERN.test(email)) {
            setInviteError("That doesn't look like an email address");
            inviteInputRef.current?.focus();
            return;
        }
        if (members.some((member) => member.username.toLowerCase() === email.toLowerCase())) {
            setInviteError("They already have access to this project");
            inviteInputRef.current?.focus();
            return;
        }

        setIsInviting(true);
        try {
            await api.inviteMember(projectId, email, inviteRole);
            toast({ title: "Invite sent", description: `${email} can now ${inviteRole === "VIEWER" ? "view" : "edit"} this project.` });
            setInviteEmail("");
            loadMembers();
            inviteInputRef.current?.focus();
        } catch (error) {
            setInviteError(error instanceof Error ? error.message : "Couldn't send the invite. Please try again.");
        } finally {
            setIsInviting(false);
        }
    };

    const handleRoleChange = async (userId: number, role: ProjectRole) => {
        const previous = members;
        setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, role } : m)));
        try {
            await api.updateMemberRole(projectId, userId, role);
        } catch (error) {
            setMembers(previous);
            toast({ title: "Couldn't update access", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
        }
    };

    const handleRemoveMember = async (userId: number) => {
        setRemovingId(userId);
        try {
            await api.removeMember(projectId, userId);
            setMembers((prev) => prev.filter((m) => m.userId !== userId));
        } catch (error) {
            toast({ title: "Couldn't remove access", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
        } finally {
            setRemovingId(null);
            setConfirmRemoveId(null);
        }
    };

    const visibleAvatars = sortedMembers.slice(0, 3);

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label="Share and manage access"
                    style={{ "--icon-hover": "scale(1.08)" } as CSSProperties}
                    className="btn flex h-8 items-center gap-2 btn-glass rounded-full pl-1.5 pr-3 text-xs font-medium active:scale-[0.97] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/35 data-[state=open]:border-primary/50"
                >
                    {visibleAvatars.length > 0 ? (
                        <span className="flex -space-x-1.5">
                            {visibleAvatars.map((member) => (
                                <span
                                    key={member.userId}
                                    title={member.name || member.username}
                                    className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-[hsl(30_11%_8%)] text-[9px] font-semibold text-white"
                                    style={generateGradient(member.username)}
                                >
                                    {initialOf(member)}
                                </span>
                            ))}
                            {members.length > visibleAvatars.length && (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-[hsl(30_11%_8%)] bg-muted text-[9px] font-semibold text-muted-foreground">
                                    +{members.length - visibleAvatars.length}
                                </span>
                            )}
                        </span>
                    ) : (
                        <UserPlus className="h-3.5 w-3.5" />
                    )}
                    Share
                </button>
            </PopoverTrigger>

            <PopoverContent
                align="end"
                sideOffset={8}
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    inviteInputRef.current?.focus();
                }}
                className="w-[380px] overflow-hidden rounded-2xl p-0"
            >
                <div className="flex items-start justify-between gap-3 px-3.5 pb-2.5 pt-3.5">
                    <div className="min-w-0">
                        <h3 className="font-display text-[17px] font-semibold tracking-tight">Share project</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {canManageMembers ? "Invite people to build this with you." : "Only the owner can invite people or change access."}
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={copyLink}
                        style={{ "--icon-hover": "rotate(-25deg)" } as CSSProperties}
                        className={cn("h-8 shrink-0 gap-1.5 px-2.5 text-xs [&_svg]:size-3.5", isLinkCopied && "text-primary")}
                    >
                        {isLinkCopied ? <Check /> : <Link2 />}
                        {isLinkCopied ? "Copied" : "Copy link"}
                    </Button>
                </div>

                {canManageMembers && (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleInvite();
                        }}
                        noValidate
                        className="px-3.5 pb-3.5"
                    >
                        <div className="flex gap-2">
                            <div
                                className={cn(
                                    "app-field group/invite flex h-9 min-w-0 flex-1 items-center rounded-full pl-3 pr-1",
                                    inviteError && "border-destructive/60 focus-within:border-destructive/60 focus-within:shadow-[0_0_0_3px_hsl(var(--destructive)/0.15)]"
                                )}
                            >
                                <Mail aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0 transition-colors", inviteError ? "text-destructive" : "text-muted-foreground group-focus-within/invite:text-primary")} />
                                <input
                                    ref={inviteInputRef}
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => {
                                        setInviteEmail(e.target.value);
                                        setInviteError(null);
                                    }}
                                    placeholder="Email"
                                    aria-label="Email to invite"
                                    aria-invalid={inviteError ? true : undefined}
                                    aria-describedby={inviteError ? "invite-error" : undefined}
                                    className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm caret-primary outline-none placeholder:text-muted-foreground"
                                />
                                <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as Exclude<ProjectRole, "OWNER">)}>
                                    <SelectPrimitive.Trigger
                                        aria-label="Access for the invite"
                                        className="group flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-foreground/80 outline-none transition-colors duration-200 hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-primary/40 data-[state=open]:bg-primary/[0.16] data-[state=open]:text-white"
                                    >
                                        <SelectValue />
                                        <ChevronDown className="h-3.5 w-3.5 opacity-70 transition-transform duration-300 group-data-[state=open]:rotate-180" />
                                    </SelectPrimitive.Trigger>
                                    <SelectContent align="end" sideOffset={8} className="w-44">
                                        {ROLE_OPTIONS.map((option) => (
                                            <RoleOption key={option.value} {...option} />
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button type="submit" disabled={!inviteEmail.trim() || isInviting} className="h-9 px-4 text-xs">
                                {isInviting ? <OrbitSpinner className="h-3.5 w-3.5" /> : "Invite"}
                            </Button>
                        </div>
                        {inviteError && (
                            <p id="invite-error" className="mt-1.5 text-xs text-destructive animate-fade-in">
                                {inviteError}
                            </p>
                        )}
                    </form>
                )}

                <div className="border-t border-white/[0.06] px-2 pb-1.5 pt-2.5">
                    <div className="flex items-center justify-between px-2 pb-1.5">
                        <p className="sidebar-label">People with access</p>
                        {!isLoadingMembers && (
                            <span className="rounded-full bg-white/[0.06] px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">{members.length}</span>
                        )}
                    </div>
                    <PeopleList>
                        {isLoadingMembers && members.length === 0 ? (
                            <div className="flex items-center gap-3 px-2 py-2">
                                <div className="app-skeleton h-8 w-8 rounded-full" />
                                <div className="flex-1 space-y-1.5">
                                    <div className="app-skeleton h-3 w-1/3 rounded" />
                                    <div className="app-skeleton h-2.5 w-1/2 rounded" />
                                </div>
                            </div>
                        ) : (
                            sortedMembers.map((member) => {
                                const isOwner = member.role === "OWNER";
                                const isConfirmingRemove = confirmRemoveId === member.userId;
                                const displayName = member.name || member.username;
                                return (
                                    <div
                                        key={member.userId}
                                        data-glide={isConfirmingRemove ? undefined : ""}
                                        className={cn("relative flex items-center gap-3 rounded-lg px-2 py-2", isConfirmingRemove && "bg-destructive/10")}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ring-1 ring-inset ring-white/15"
                                            style={generateGradient(member.username)}
                                        >
                                            {initialOf(member)}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">
                                                {displayName}
                                                {member.userId === currentUserId && (
                                                    <span className="ml-1 text-xs font-normal text-muted-foreground">(You)</span>
                                                )}
                                            </p>
                                            <p className="truncate text-xs text-muted-foreground">{member.username}</p>
                                        </div>

                                        {isConfirmingRemove ? (
                                            <div className="flex shrink-0 items-center gap-1 animate-fade-in">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setConfirmRemoveId(null)}
                                                    disabled={removingId === member.userId}
                                                    className="h-7 px-2 text-xs"
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    onClick={() => handleRemoveMember(member.userId)}
                                                    disabled={removingId === member.userId}
                                                    className="h-7 gap-1 px-2 text-xs [&_svg]:size-3.5"
                                                >
                                                    {removingId === member.userId ? <OrbitSpinner className="h-3.5 w-3.5" /> : <UserX />}
                                                    Remove
                                                </Button>
                                            </div>
                                        ) : isOwner ? (
                                            <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-foreground/90">
                                                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                                                Owner
                                            </span>
                                        ) : canManageMembers ? (
                                            <Select
                                                value={member.role}
                                                onValueChange={(value) => {
                                                    if (value === REMOVE_VALUE) setConfirmRemoveId(member.userId);
                                                    else handleRoleChange(member.userId, value as ProjectRole);
                                                }}
                                            >
                                                <SelectTrigger
                                                    aria-label={`Access for ${displayName}`}
                                                    chip
                                                    className="h-7 w-auto shrink-0 gap-1 px-2.5 text-xs"
                                                >
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent align="end" sideOffset={8} className="w-44">
                                                    {ROLE_OPTIONS.map((option) => (
                                                        <RoleOption key={option.value} {...option} />
                                                    ))}
                                                    <SelectPrimitive.Separator className="mx-1 my-1 h-px bg-[hsl(40_30%_86%/0.12)]" />
                                                    <SelectPrimitive.Item
                                                        value={REMOVE_VALUE}
                                                        data-danger="delete"
                                                        className="menu-item-hl relative flex cursor-pointer select-none items-center gap-2 rounded-xl py-2 pl-9 pr-3 text-[13px] font-medium text-white/90 outline-none"
                                                    >
                                                        <UserX className="absolute left-3 h-3.5 w-3.5" />
                                                        <SelectPrimitive.ItemText>Remove access</SelectPrimitive.ItemText>
                                                    </SelectPrimitive.Item>
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <span className="shrink-0 rounded-full bg-white/[0.05] px-2.5 py-1 text-xs text-muted-foreground">
                                                {ROLE_LABELS[member.role]}
                                            </span>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </PeopleList>
                </div>

                <div className="flex items-center gap-2.5 border-t border-white/[0.06] bg-black/15 px-4 py-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05]">
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-xs font-medium">Private project</p>
                        <p className="text-[11px] text-muted-foreground">Only people with access can open this link.</p>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
