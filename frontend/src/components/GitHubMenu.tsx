/**
 * The GitHub button in a project's header, and its panel.
 *
 * Handles: for the owner, connecting a GitHub account (which leaves for GitHub and comes back), making a repository
 * for the project with a name and a choice of private or public, pushing later changes, the link to the repository,
 * saying which files a push left out on purpose, forgetting the repository behind a confirmation, and disconnecting
 * the account. For everyone else in the project it shows the repository if there is one, and no controls.
 *
 * A push after the first carries a line saying what changed, which becomes the commit's message: the newest change
 * as History words it (lib/revisions), read from the project's revisions at the moment of the press. If that list
 * cannot be read the push goes without one and the server says "Update from Singularity".
 *
 * It draws nothing at all when the deployment has no GitHub app registered: the server says the feature is
 * unavailable, and a button that could only explain that it does nothing has no place in the header.
 *
 * The button is GitHub's own mark with no word beside it - the owner asked for the logo in place of the text - and
 * says "Push to GitHub" in a tooltip. Inside the panel the connected account is a small chip with GitHub's mark
 * at the head, beside the title, where a line reading "Connected as ..." used to be squeezed into the foot beside
 * two text buttons; Forget repository and Disconnect are the app's chips in the foot, and the foot says the one
 * thing a push needs known - that it makes the repository match the project. The panel is drawn as Publish and Share beside it are: the same heading with one line
 * under it, a field and the app's primary button on one row, and the same foot. Nothing opens by itself and nothing is sent until a
 * press. Leaving for GitHub is a whole-page navigation, and only ever to GitHub's own address (lib/github): the
 * address comes from a response, and the browser does not follow a response anywhere else.
 */
import { useState } from "react";
import { ExternalLink, FolderGit2, Github, Lock } from "lucide-react";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useProjectGitHub } from "@/hooks/use-github";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import {
  REPO_NAME_MAX,
  canPush,
  gitHubHeadline,
  isGitHubAddress,
  leftOutSentence,
  pushLabel,
  rememberReturnPath,
  repoNameProblem,
} from "@/lib/github";
import { newestChangeTitle, type TurnForHistory } from "@/lib/revisions";
import { cn } from "@/lib/utils";

const TONE_DOT: Record<string, string> = {
  idle: "bg-muted-foreground/50",
  live: "bg-syntax-string",
  waiting: "bg-primary",
};

export function GitHubMenu({ projectId, role, projectName, turns = [] }: {
  projectId: string;
  role: string | undefined;
  projectName: string;
  turns?: readonly TurnForHistory[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const { toast } = useToast();
  const github = useProjectGitHub(projectId);

  const state = github.state;
  if (!state?.available) return null;

  const owner = canPush(role);
  const text = gitHubHeadline(state);
  const problem = state.linked ? null : repoNameProblem(name);
  const leftOut = leftOutSentence(state.leftOut);

  const failed = (title: string) => (error: unknown) =>
    toast({ title, description: error instanceof Error ? error.message : undefined, variant: "destructive" });

  const connect = () => {
    setIsConnecting(true);
    api
      .startGitHubConnect()
      .then((url) => {
        if (!isGitHubAddress(url)) throw new Error("The address to connect through was not GitHub's.");
        rememberReturnPath(window.location.pathname);
        window.location.assign(url);
      })
      .catch((error: unknown) => {
        setIsConnecting(false);
        failed("Couldn't start connecting GitHub")(error);
      });
  };

  const push = () => {
    const message = state.linked
      ? api.getRevisions(projectId).then((revisions) => newestChangeTitle(revisions, turns) ?? undefined, () => undefined)
      : Promise.resolve(undefined);
    message
      .then((line) => github.push({ name: state.linked ? undefined : name, privateRepo: isPrivate, message: line }))
      .catch(failed("Couldn't push to GitHub"));
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`GitHub. ${text.title}`}
                className="btn btn-glass flex h-8 w-8 items-center justify-center rounded-full active:scale-[0.97] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/35 data-[state=open]:border-primary/50"
              >
                {github.isPushing ? <OrbitSpinner /> : <Github className="h-4 w-4" />}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="px-2 py-1 text-xs">Push to GitHub</TooltipContent>
        </Tooltip>

        <PopoverContent align="end" sideOffset={8} className="w-[380px] overflow-hidden rounded-2xl p-0">
          <div className="flex items-start justify-between gap-3 px-3.5 pb-2.5 pt-3.5">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 font-display text-[17px] font-semibold tracking-tight">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT[text.tone])} />
                {text.title}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{text.detail}</p>
            </div>
            {owner && state.connected && state.login && (
              <span
                title={`Connected as ${state.login}`}
                className="mt-0.5 inline-flex h-6 max-w-[11rem] shrink-0 items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 text-[11px] font-medium text-foreground/85"
              >
                <Github aria-hidden="true" className="h-3 w-3 shrink-0" />
                <span className="truncate">{state.login}</span>
              </span>
            )}
          </div>

          <div className="px-3.5 pb-3.5">
            {state.linked && state.url && (
              <div className="flex gap-2">
                <a
                  href={state.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open the repository on GitHub in a new tab"
                  title={state.url}
                  className="app-field group/link flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full px-3 text-sm text-foreground/90 hover:text-primary"
                >
                  {state.privateRepo ? (
                    <Lock aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover/link:text-primary" />
                  ) : (
                    <FolderGit2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover/link:text-primary" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{state.fullName}</span>
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </a>
                {owner && state.connected && state.hasChanges && (
                  <Button type="button" disabled={github.isPushing} onClick={push} className="h-9 px-4 text-xs">
                    {pushLabel(state)}
                  </Button>
                )}
              </div>
            )}

            {owner && !state.connected && (
              <Button type="button" disabled={isConnecting} onClick={connect} className={cn("h-9 w-full px-4 text-xs", state.linked && "mt-2")}>
                {isConnecting ? "Opening GitHub" : "Connect GitHub"}
              </Button>
            )}

            {owner && state.connected && !state.linked && (
              <>
                <div className="flex gap-2">
                  <div
                    className={cn(
                      "app-field group/name flex h-9 min-w-0 flex-1 items-center rounded-full pl-3 pr-3",
                      problem && "border-destructive/60 focus-within:border-destructive/60 focus-within:shadow-[0_0_0_3px_hsl(var(--destructive)/0.15)]"
                    )}
                  >
                    <FolderGit2 aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0 transition-colors", problem ? "text-destructive" : "text-muted-foreground group-focus-within/name:text-primary")} />
                    <input
                      id="github-repo-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={REPO_NAME_MAX}
                      placeholder={state.suggestedName ?? "my-app"}
                      aria-label="Repository name"
                      aria-invalid={!!problem}
                      className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm caret-primary outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  <Button type="button" disabled={github.isPushing || !!problem} onClick={push} className="h-9 px-4 text-xs">
                    {pushLabel(state)}
                  </Button>
                </div>
                {problem && <p className="mt-1.5 text-xs text-destructive animate-fade-in">{problem}</p>}
                <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground/90">
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="accent-[hsl(var(--primary))]"
                  />
                  Private repository
                </label>
              </>
            )}

            {leftOut && <p className="mt-2 text-[11px] text-muted-foreground">{leftOut}</p>}

            {!owner && !state.linked && (
              <p className="text-xs text-muted-foreground">Only the project's owner can push it to GitHub.</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] bg-black/15 px-3.5 py-2.5">
            <p className="min-w-0 text-[11px] leading-snug text-muted-foreground">A push makes the repository match this project.</p>
            {owner && (state.connected || state.linked) && (
              <div className="flex shrink-0 items-center gap-1.5">
                {state.linked && (
                  <button
                    type="button"
                    disabled={github.isForgetting}
                    onClick={() => setConfirmForget(true)}
                    className="app-chip inline-flex h-7 items-center rounded-full px-3 text-xs text-foreground/80 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
                  >
                    Forget repository
                  </button>
                )}
                {state.connected && (
                  <button
                    type="button"
                    disabled={github.isDisconnecting}
                    onClick={() => void github.disconnect().catch(failed("Couldn't disconnect GitHub"))}
                    className="app-chip inline-flex h-7 items-center rounded-full px-3 text-xs text-foreground/80 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={confirmForget} onOpenChange={setConfirmForget}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Forget the repository for {projectName}?</AlertDialogTitle>
            <AlertDialogDescription>
              The repository stays on GitHub exactly as it is. This project stops being linked to it, so the next push makes a
              new repository.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => void github.forget().catch(failed("Couldn't forget the repository"))}
            >
              Forget it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
