/**
 * The settings page: how the app behaves for this person, as distinct from who they are.
 *
 * Handles: choosing who explanations are written for; how the code editor reads - the size of its text and whether
 * long lines wrap; and the GitHub connection, with disconnecting it. Who is signed in, the plan, security and
 * deleting the account are the Account pages' (pages/Account and the two beside it): the owner asked for the account
 * to be one thing and settings another.
 *
 * It holds only what is found nowhere else. Its first version also listed the plan, linked Usage, Plans & billing
 * and Security, opened the invitations and linked Privacy and Terms - every one of which is its own entry in the
 * account menu this page is opened from - and the owner asked for the repeats to go. What is left is three kinds
 * of preference, with a short index down the side as the settings pages of the owner's other apps have.
 *
 * The level is the same
 * preference the Build/Teach menu sets (lib/learner-level), kept in this browser under the person's id. The editor's
 * choices are kept per browser (lib/editor-preferences) and an open editor follows them at once; the sample under
 * them is drawn in the chosen size so the choice can be seen without opening a project. Whether a new chat starts in
 * Build or Teach is not offered: it is off at the start of every session on purpose (hooks/use-teaching-mode).
 *
 * It stands on the app's night like Security and Usage - the shared page heading over raised panels that rise in one
 * after another - and asks the server for nothing but GitHub's standing.
 */
import { Nebula } from "@/components/app/Nebula";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { PageHeading } from "@/components/app/PageHeading";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Code2, Github, GraduationCap, Link2, type LucideIcon } from "lucide-react";
import { AppSidebar, SidebarSpacer } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/hooks/use-sidebar";
import { useToast } from "@/hooks/use-toast";
import { api, isAuthenticated, loginRedirectPath } from "@/lib/api";
import { EDITOR_TEXT_SIZES, editorTextPx, useEditorPreferences } from "@/lib/editor-preferences";
import { LEARNER_LEVELS, useLearnerLevel } from "@/lib/learner-level";
import { cn } from "@/lib/utils";

const PAGE_GLOW: CSSProperties = {
  backgroundImage: [
    "radial-gradient(70% 45% at 50% -8%, hsl(40.7 99.9% 76.1% / 0.07) 0%, transparent 70%)",
    "radial-gradient(35% 30% at 92% 0%, hsl(41.3 100% 85.6% / 0.04) 0%, transparent 70%)",
  ].join(", "),
};

const SECTIONS = [
  { id: "learning", label: "Learning" },
  { id: "editor", label: "Editor" },
  { id: "connections", label: "Connections" },
] as const;

const GITHUB_STATUS_KEY = ["github", "status"] as const;

const SAMPLE = `function greet(name: string) {\n  return \`Hello, \${name}. This line is long on purpose, so you can see what wrapping does to it here.\`;\n}`;

function Section({ id, index, label, title, Icon, description, children }: {
  id: string;
  index: number;
  label: string;
  title: string;
  Icon: LucideIcon;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="app-glass app-rise scroll-mt-4 rounded-[22px] p-5" style={{ "--i": index } as CSSProperties}>
      <p className="app-label">{label}</p>
      <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Choice({ selected, onSelect, title, hint, className }: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "app-field relative rounded-2xl p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
        selected && "border-primary/50 bg-primary/[0.06]",
        className
      )}
    >
      {selected && <Check aria-hidden="true" className="absolute right-3 top-3 h-3.5 w-3.5 text-primary" />}
      <p className="pr-5 text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </button>
  );
}

export function Settings() {
  const navigate = useNavigate();
  const sidebar = useSidebar();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [level, setLevel] = useLearnerLevel();
  const [editor, setEditor] = useEditorPreferences();
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) navigate(loginRedirectPath());
  }, [navigate]);

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

  const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="dash-night dash-sky relative flex h-screen overflow-hidden bg-background">
      <Nebula />
      <SidebarSpacer sidebar={sidebar} />

      <div className="dash-frame relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={PAGE_GLOW} />
        <header className="relative flex h-12 shrink-0 items-center gap-2 px-2" />

        <main className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-4 sm:px-6">
            <div className="mb-6">
              <PageHeading eyebrow="Account" title="Your" accent="settings">
                How the app teaches you, how your code reads, and what it is connected to.
              </PageHeading>
            </div>

            <div className="grid gap-6 lg:grid-cols-[150px_minmax(0,1fr)]">
              <nav aria-label="Settings sections" className="hidden lg:block">
                <ul className="sticky top-4 space-y-0.5">
                  {SECTIONS.map((section) => (
                    <li key={section.id}>
                      <button
                        type="button"
                        onClick={() => jumpTo(section.id)}
                        className="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                      >
                        {section.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>

              <div className="space-y-4">
                <Section id="learning" index={1} label="Learning" title="Who explanations are written for" Icon={GraduationCap} description="Lessons, the big picture, the project tour and ExplainLLM are written for this. It changes what is written from now on, not what was already written.">
                  <div role="radiogroup" aria-label="Who explanations are written for" className="grid gap-2 sm:grid-cols-3">
                    {LEARNER_LEVELS.map((option) => (
                      <Choice
                        key={option.value}
                        selected={option.value === level}
                        onSelect={() => setLevel(option.value)}
                        title={option.label}
                        hint={option.hint}
                      />
                    ))}
                  </div>
                </Section>

                <Section id="editor" index={2} label="Editor" title="How your code reads" Icon={Code2} description="For the code view in every project, on this browser. An open editor changes as you choose.">
                  <p className="text-sm font-medium">Text size</p>
                  <div role="radiogroup" aria-label="Editor text size" className="mt-2 grid grid-cols-3 gap-2">
                    {EDITOR_TEXT_SIZES.map((option) => (
                      <Choice
                        key={option.value}
                        selected={option.value === editor.textSize}
                        onSelect={() => setEditor({ textSize: option.value })}
                        title={option.label}
                      />
                    ))}
                  </div>

                  <p className="mt-4 text-sm font-medium">Long lines</p>
                  <div role="radiogroup" aria-label="Long lines" className="mt-2 grid grid-cols-2 gap-2">
                    <Choice selected={editor.wrapLines} onSelect={() => setEditor({ wrapLines: true })} title="Wrap" hint="A long line continues underneath. Nothing runs off the side." />
                    <Choice selected={!editor.wrapLines} onSelect={() => setEditor({ wrapLines: false })} title="Scroll" hint="Each line stays on one row. Scroll sideways to read the end." />
                  </div>

                  <pre
                    aria-label="Sample of the editor's text"
                    className={cn(
                      "app-field mt-4 overflow-x-auto rounded-2xl p-3 font-mono leading-[1.7] text-foreground/90",
                      editor.wrapLines ? "whitespace-pre-wrap break-words" : "whitespace-pre"
                    )}
                    style={{ fontSize: `${editorTextPx(editor.textSize)}px` }}
                  >
                    {SAMPLE}
                  </pre>
                </Section>

                <Section id="connections" index={3} label="Connections" title="What your account is connected to" Icon={Link2} description="A connection lets you push a project you own to a repository of your own.">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
                        <Github aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">GitHub</p>
                        <p className="text-xs text-muted-foreground">
                          {!github
                            ? "Checking…"
                            : !github.available
                              ? "Connecting to GitHub is not set up on this deployment."
                              : github.connected
                                ? <>Connected as <span className="font-medium text-foreground">{github.login}</span></>
                                : "Not connected. Connect it from the GitHub button in a project you own."}
                        </p>
                      </div>
                    </div>
                    {github?.available && github.connected && (
                      <Button variant="outline" size="sm" disabled={isDisconnecting} onClick={() => void disconnectGitHub()} className="gap-1.5">
                        {isDisconnecting && <OrbitSpinner className="h-3.5 w-3.5" />}
                        Disconnect
                      </Button>
                    )}
                  </div>
                </Section>
              </div>
            </div>
          </div>
        </main>
      </div>

      <AppSidebar sidebar={sidebar} inset />
    </div>
  );
}
