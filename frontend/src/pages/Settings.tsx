/**
 * The settings page: one column of boxes holding everything about the person's account and how the app behaves.
 *
 * Handles: the profile (name, email, plan); choosing who explanations are written for; how the code editor reads -
 * the size of its text and whether long lines wrap; the GitHub connection, with disconnecting it; sign-in security
 * (components/settings/SecuritySections); and how to have the account deleted - in that order, top to bottom.
 * An address ending #security opens scrolled to the security boxes, which is where /settings/security now leads.
 *
 * Account and Settings were two places - the account three tabs (Profile, Plans & billing, Security) and Settings a
 * page of preferences with an index down its side. The owner asked for one Settings page of boxes with no index,
 * and for Plans & billing to stand apart as its own page (pages/BillingSettings), reached from the account menu.
 *
 * The level is the same preference the Build/Teach menu sets (lib/learner-level), kept in this browser under the
 * person's id. The editor's choices are kept per browser (lib/editor-preferences) and an open editor follows them at
 * once; the sample under them is drawn in the chosen size so the choice can be seen without opening a project.
 * Whether a new chat starts in Build or Teach is not offered: it is off at the start of every session on purpose
 * (hooks/use-teaching-mode). The name and email are shown and not edited: they come from the sign-in provider.
 * Deleting the account is the last box (components/settings/DeleteAccount); it was once a link to where to ask for
 * it by hand.
 *
 * It stands on the app's night like Usage and billing - the shared page heading over raised cards that rise in one
 * after another. Each box is a components/settings/SettingsCard (an icon tile, a label, a title and a line of
 * description over a recessed body); the profile opens with a large avatar and the plan as a gold badge that leads to
 * Plans & billing, a choice is a card of its own that lights gold when it is the one in force, the editor's sample sits
 * in a small window with its file name and the size and wrapping it is drawn with, the GitHub connection shows a live
 * status dot, and Delete account is the one box in the danger tone.
 */
import { Nebula } from "@/components/app/Nebula";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { PageHeading } from "@/components/app/PageHeading";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowUpRight, Check, Code2, Github, GraduationCap, Layers, Link2, Rocket, Sparkles, Sprout, Trash2, UserRound, WrapText, type LucideIcon } from "lucide-react";
import { AppSidebar, SidebarSpacer } from "@/components/AppSidebar";
import { DeleteAccount } from "@/components/settings/DeleteAccount";
import { SecuritySections } from "@/components/settings/SecuritySections";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { Button } from "@/components/ui/button";
import { useBilling } from "@/hooks/use-billing";
import { useSidebar } from "@/hooks/use-sidebar";
import { useToast } from "@/hooks/use-toast";
import { api, getUserInfo, isAuthenticated, loginRedirectPath } from "@/lib/api";
import { EDITOR_TEXT_SIZES, editorTextPx, useEditorPreferences } from "@/lib/editor-preferences";
import { LEARNER_LEVELS, useLearnerLevel } from "@/lib/learner-level";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";

const PAGE_GLOW: CSSProperties = {
  backgroundImage: [
    "radial-gradient(70% 45% at 50% -8%, hsl(40.7 99.9% 76.1% / 0.07) 0%, transparent 70%)",
    "radial-gradient(35% 30% at 92% 0%, hsl(41.3 100% 85.6% / 0.04) 0%, transparent 70%)",
  ].join(", "),
};

const GITHUB_STATUS_KEY = ["github", "status"] as const;

const SAMPLE = `function greet(name: string) {\n  return \`Hello, \${name}. This line is long on purpose, so you can see what wrapping does to it here.\`;\n}`;

const LEVEL_ICONS: Record<string, LucideIcon> = { NEW: Sprout, SOME: Layers, DEVELOPER: Rocket };

function Choice({ selected, onSelect, title, hint, Icon, lead, className }: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint?: string;
  Icon?: LucideIcon;
  lead?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "settings-choice rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute right-3.5 top-3.5 flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-white/20"
        )}
      >
        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      {(Icon || lead) && (
        <span
          aria-hidden="true"
          className={cn(
            "mb-3 flex h-9 w-fit min-w-9 items-center justify-center rounded-xl border px-2 transition-colors",
            selected ? "border-primary/40 bg-primary/15 text-primary" : "border-white/10 bg-white/[0.04] text-muted-foreground"
          )}
        >
          {Icon ? <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} /> : lead}
        </span>
      )}
      <p className="pr-7 text-sm font-semibold tracking-tight">{title}</p>
      {hint && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </button>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2.5 text-[13px] font-medium text-foreground/90">{children}</p>;
}

export function Settings() {
  const navigate = useNavigate();
  const sidebar = useSidebar();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [level, setLevel] = useLearnerLevel();
  const [editor, setEditor] = useEditorPreferences();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const { subscription } = useBilling();
  const user = getUserInfo();
  const { hash } = useLocation();

  useEffect(() => {
    if (!isAuthenticated()) navigate(loginRedirectPath());
  }, [navigate]);

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash]);

  const { data: github } = useQuery({
    queryKey: GITHUB_STATUS_KEY,
    queryFn: () => api.getGitHubStatus(),
    enabled: isAuthenticated(),
    retry: false,
  });

  const disconnectGitHub = async () => {
    setIsDisconnecting(true);
    try {
      await api.disconnectGitHub();
      await queryClient.invalidateQueries({ queryKey: ["github"] });
      toast({ title: "GitHub disconnected", description: "Your repositories are untouched. You can connect again from the GitHub button in a project you own." });
    } catch (error) {
      toast({ title: "Couldn't disconnect GitHub", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="dash-night dash-sky relative flex h-screen overflow-hidden bg-background">
      <Nebula stars={false} strong />
      <SidebarSpacer sidebar={sidebar} />

      <div className="dash-frame relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={PAGE_GLOW} />
        <header className="relative flex h-12 shrink-0 items-center gap-2 px-2" />

        <main className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-4 sm:px-6">
            <div className="mb-6">
              <PageHeading eyebrow="Account" title="Your" accent="settings">
                Who you are here, how the app teaches you, how your code reads, and how you sign in.
              </PageHeading>
            </div>

            <div className="space-y-5">
              <SettingsCard id="profile" index={1} label="Profile" title="Who you are here" Icon={UserRound} description="Your name and email come from how you sign in, so they are changed there.">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
                  <UserAvatar name={user?.name} className="h-16 w-16 text-xl" />
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-base font-semibold tracking-tight">{user?.name || "Signed in"}</p>
                    <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{user?.username}</p>
                    {subscription && (
                      <span className="mt-2.5 inline-flex h-6 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 text-[11px] font-medium text-primary">
                        <Sparkles aria-hidden="true" className="h-3 w-3" /> {subscription.plan.name} plan
                      </span>
                    )}
                  </div>
                  <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <Link to="/settings/billing">
                      Plans &amp; billing <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </SettingsCard>

              <SettingsCard id="learning" index={2} label="Learning" title="Who explanations are written for" Icon={GraduationCap} description="Lessons, the big picture, the project tour and ExplainLLM are written for this. It changes what is written from now on, not what was already written.">
                <div role="radiogroup" aria-label="Who explanations are written for" className="grid gap-3 sm:grid-cols-3">
                  {LEARNER_LEVELS.map((option) => (
                    <Choice
                      key={option.value}
                      selected={option.value === level}
                      onSelect={() => setLevel(option.value)}
                      title={option.label}
                      hint={option.hint}
                      Icon={LEVEL_ICONS[option.value]}
                    />
                  ))}
                </div>
              </SettingsCard>

              <SettingsCard id="editor" index={3} label="Editor" title="How your code reads" Icon={Code2} description="For the code view in every project, on this browser. An open editor changes as you choose.">
                <GroupLabel>Text size</GroupLabel>
                <div role="radiogroup" aria-label="Editor text size" className="grid grid-cols-3 gap-3">
                  {EDITOR_TEXT_SIZES.map((option) => (
                    <Choice
                      key={option.value}
                      selected={option.value === editor.textSize}
                      onSelect={() => setEditor({ textSize: option.value })}
                      title={option.label}
                      lead={<span className="font-mono font-medium leading-none" style={{ fontSize: `${Math.round(option.px * 1.35)}px` }}>Aa</span>}
                    />
                  ))}
                </div>

                <div className="mt-6">
                  <GroupLabel>Long lines</GroupLabel>
                  <div role="radiogroup" aria-label="Long lines" className="grid gap-3 sm:grid-cols-2">
                    <Choice selected={editor.wrapLines} onSelect={() => setEditor({ wrapLines: true })} Icon={WrapText} title="Wrap" hint="A long line continues underneath. Nothing runs off the side." />
                    <Choice selected={!editor.wrapLines} onSelect={() => setEditor({ wrapLines: false })} Icon={ArrowLeftRight} title="Scroll" hint="Each line stays on one row. Scroll sideways to read the end." />
                  </div>
                </div>

                <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 [background-color:hsl(30_14%_4%)] shadow-[inset_0_1px_0_hsl(0_0%_100%/0.04)]">
                  <div className="flex items-center gap-3 border-b border-white/[0.07] bg-white/[0.025] px-4 py-2.5">
                    <span aria-hidden="true" className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                      <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                      <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">greet.ts</span>
                    <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {editorTextPx(editor.textSize)}px · {editor.wrapLines ? "wrap" : "scroll"}
                    </span>
                  </div>
                  <pre
                    aria-label="Sample of the editor's text"
                    className={cn(
                      "overflow-x-auto p-4 font-mono leading-[1.7] text-foreground/90",
                      editor.wrapLines ? "whitespace-pre-wrap break-words" : "whitespace-pre"
                    )}
                    style={{ fontSize: `${editorTextPx(editor.textSize)}px` }}
                  >
                    {SAMPLE}
                  </pre>
                </div>
              </SettingsCard>

              <SettingsCard id="connections" index={4} label="Connections" title="What your account is connected to" Icon={Link2} description="A connection lets you push a project you own to a repository of your own.">
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
                      <Github aria-hidden="true" className="h-5 w-5 text-foreground/90" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        GitHub
                        {github?.available && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-1.5 text-[8px] font-medium uppercase leading-[14px] tracking-wide",
                              github.connected ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/10 text-muted-foreground"
                            )}
                          >
                            <span aria-hidden="true" className={cn("h-[3px] w-[3px] rounded-full", github.connected ? "bg-emerald-400" : "bg-white/30")} />
                            {github.connected ? "Connected" : "Not connected"}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {!github
                          ? "Checking…"
                          : !github.available
                            ? "Connecting to GitHub is not set up on this deployment."
                            : github.connected
                              ? <>Connected as <span className="font-medium text-foreground">{github.login}</span></>
                              : "Connect it from the GitHub button in a project you own."}
                      </p>
                    </div>
                  </div>
                  {github?.available && github.connected && (
                    <Button variant="outline" size="sm" disabled={isDisconnecting} onClick={() => void disconnectGitHub()} className="app-chip-danger gap-1.5 border-red-400/40 text-red-300">
                      {isDisconnecting && <OrbitSpinner className="h-3.5 w-3.5" />}
                      Disconnect
                    </Button>
                  )}
                </div>
              </SettingsCard>

              <SecuritySections startIndex={5} />

              <SettingsCard
                id="delete-account"
                index={8}
                label="The way out"
                title="Delete your account"
                Icon={Trash2}
                tone="danger"
                description="Removes your account and everything in it, at once and for good. Projects you own are deleted for everyone in them, and a paid plan ends today."
                action={<DeleteAccount />}
              />
            </div>
          </div>
        </main>
      </div>

      <AppSidebar sidebar={sidebar} inset />
    </div>
  );
}
