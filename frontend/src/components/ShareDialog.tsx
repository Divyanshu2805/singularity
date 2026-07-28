/**
 * The Share button, with collaborator avatars, plus its panel.
 *
 * Handles: listing members and their roles, inviting someone by email, changing a role and removing a member - with
 * the controls hidden for a caller who cannot manage members.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, Link2, Loader2, Lock, Mail, ShieldCheck, UserPlus, UserX } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, getUserInfo } from "@/lib/api";
import { ProjectMember, ProjectRole } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
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
    return (
        <SelectPrimitive.Item
            value={value}
            className="relative flex cursor-pointer select-none flex-col items-start rounded-md py-2 pl-8 pr-3 text-xs outline-none transition-colors data-[highlighted]:bg-primary/10 data-[state=checked]:text-primary data-[highlighted]:text-primary"
        >
            <span className="absolute left-2.5 top-2.5 flex h-3.5 w-3.5 items-center justify-center">
                <SelectPrimitive.ItemIndicator>
                    <Check className="h-3.5 w-3.5" />
                </SelectPrimitive.ItemIndicator>
            </span>
            <SelectPrimitive.ItemText>{ROLE_LABELS[value]}</SelectPrimitive.ItemText>
            <span className="mt-0.5 text-[11px] text-muted-foreground">{description}</span>
        </SelectPrimitive.Item>
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
                    className="flex h-8 items-center gap-2 rounded-md border border-border pl-1.5 pr-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-primary/60 data-[state=open]:bg-primary/15 data-[state=open]:text-primary"
                >
                    {visibleAvatars.length > 0 ? (
                        <span className="flex -space-x-1.5">
                            {visibleAvatars.map((member) => (
                                <span
                                    key={member.userId}
                                    title={member.name || member.username}
                                    className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-panel text-[9px] font-semibold text-white"
                                    style={generateGradient(member.username)}
                                >
                                    {initialOf(member)}
                                </span>
                            ))}
                            {members.length > visibleAvatars.length && (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-panel bg-muted text-[9px] font-semibold text-muted-foreground">
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
                className="w-[420px] overflow-hidden rounded-xl border-border/80 p-0 shadow-2xl shadow-black/40"
            >
                <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold">Share project</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {canManageMembers ? "Invite people to build this with you." : "Only the owner can invite people or change access."}
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={copyLink}
                        className={cn("h-7 shrink-0 gap-1.5 px-2.5 text-xs [&_svg]:size-3.5", isLinkCopied && "border-primary/50 text-primary")}
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
                        className="px-4 pb-4"
                    >
                        <div className="flex gap-2">
                            <div
                                className={cn(
                                    "flex h-9 min-w-0 flex-1 items-center rounded-lg border bg-background/60 pl-2.5 pr-0.5 transition-[border-color,box-shadow] duration-150 focus-within:ring-[3px]",
                                    inviteError
                                        ? "border-destructive/60 focus-within:ring-destructive/15"
                                        : "border-border/80 hover:border-primary/40 focus-within:border-primary/60 focus-within:ring-primary/15"
                                )}
                            >
                                <Mail aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0", inviteError ? "text-destructive" : "text-muted-foreground")} />
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
                                    className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm caret-primary outline-none placeholder:text-muted-foreground/70"
                                />
                                <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as Exclude<ProjectRole, "OWNER">)}>
                                    <SelectTrigger
                                        aria-label="Access for the invite"
                                        className="h-7 w-auto shrink-0 gap-1 rounded-md border-0 bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-muted/60 hover:text-primary focus:ring-0 data-[state=open]:bg-primary/10 data-[state=open]:text-primary"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent align="end" className="w-64">
                                        {ROLE_OPTIONS.map((option) => (
                                            <RoleOption key={option.value} {...option} />
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button type="submit" disabled={!inviteEmail.trim() || isInviting} className="h-9 px-4 text-xs">
                                {isInviting ? <Loader2 className="animate-spin" /> : "Invite"}
                            </Button>
                        </div>
                        {inviteError && (
                            <p id="invite-error" className="mt-1.5 text-xs text-destructive animate-fade-in">
                                {inviteError}
                            </p>
                        )}
                    </form>
                )}

                <div className="border-t border-border/60 px-2 pb-2 pt-3">
                    <div className="flex items-center justify-between px-2 pb-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">People with access</p>
                        {!isLoadingMembers && (
                            <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">{members.length}</span>
                        )}
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                        {isLoadingMembers && members.length === 0 ? (
                            <div className="flex animate-pulse items-center gap-3 px-2 py-2">
                                <div className="h-8 w-8 rounded-full bg-muted" />
                                <div className="flex-1 space-y-1.5">
                                    <div className="h-3 w-1/3 rounded bg-muted" />
                                    <div className="h-2.5 w-1/2 rounded bg-muted" />
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
                                        className={cn(
                                            "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors",
                                            isConfirmingRemove ? "bg-destructive/10" : "hover:bg-muted/40"
                                        )}
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
                                                    {removingId === member.userId ? <Loader2 className="animate-spin" /> : <UserX />}
                                                    Remove
                                                </Button>
                                            </div>
                                        ) : isOwner ? (
                                            <span className="flex shrink-0 items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                                                <ShieldCheck className="h-3.5 w-3.5" />
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
                                                    className="h-7 w-auto shrink-0 gap-1 rounded-md border border-border bg-background/60 px-2.5 text-xs shadow-none hover:border-primary/50 hover:text-primary focus:ring-0 data-[state=open]:border-primary/60 data-[state=open]:text-primary"
                                                >
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent align="end" className="w-64">
                                                    {ROLE_OPTIONS.map((option) => (
                                                        <RoleOption key={option.value} {...option} />
                                                    ))}
                                                    <SelectPrimitive.Separator className="-mx-1 my-1 h-px bg-border" />
                                                    <SelectPrimitive.Item
                                                        value={REMOVE_VALUE}
                                                        className="flex cursor-pointer select-none items-center gap-2 rounded-md py-2 pl-8 pr-3 text-xs text-destructive outline-none transition-colors data-[highlighted]:bg-destructive/10"
                                                    >
                                                        <SelectPrimitive.ItemText>Remove access</SelectPrimitive.ItemText>
                                                    </SelectPrimitive.Item>
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <span className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                                                {ROLE_LABELS[member.role]}
                                            </span>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2.5 border-t border-border/60 bg-panel/60 px-4 py-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60">
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
