/**
 * The public page of a shared app: the app, its code to read, and a way to fork it.
 *
 * Handles: loading a shared app by its link name with no sign-in, showing the code of the version that is live as a file
 * tree and a read-only viewer (a file is fetched when it is picked, and a binary or very large file says so instead of
 * showing noise), a link to open the running app, and Fork - for someone signed in, a new project of their own made from
 * that code; for someone who is not, the way to sign in and come straight back here.
 *
 * Open to anyone, so it asks for nothing and shows nothing about the owner. An app that is not shared, not published, or
 * not there looks the same - "isn't shared" - because the server answers the same for each, and the page must not
 * suggest which. The code is the snapshot stored with the live build, never the project's current files, so what is read
 * here is exactly what is running.
 *
 * Drawn as the workspace is, so a visitor sees the product's own look: the same stage and windows, the file tree and the
 * highlighted viewer reused from the code panel, and the app's quiet chips for the two actions. Nothing loads until it is
 * needed: the first file is opened for them, since a code page with nothing showing would read as broken, and the rest on
 * a press.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, FileWarning, GitFork, RotateCcw } from "lucide-react";
import { AppLoading } from "@/components/app/AppLoading";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { StatusScreen } from "@/components/app/StatusScreen";
import { FileTree } from "@/components/FileTree";
import { HorizonMark } from "@/components/HorizonMark";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ApiRequestError, api, buildFileTree, isAuthenticated, isQuotaError } from "@/lib/api";
import { highlightCode, MAX_HIGHLIGHT_CHARS } from "@/lib/highlight-code";
import { loginWithNext } from "@/lib/next-path";
import { sharePath } from "@/lib/publish";
import { cn, generateGradient } from "@/lib/utils";

const FIRST_FILES = ["src/App.tsx", "src/pages/Index.tsx", "src/main.tsx", "package.json", "index.html"];

function ViewerNote({ children, tone }: { children: string; tone?: "alert" }) {
  return (
    <div role={tone ? "alert" : undefined} className="app-fade flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03]">
        <FileWarning className={tone ? "h-[18px] w-[18px] text-primary/80" : "h-[18px] w-[18px] text-muted-foreground"} />
      </span>
      <p className="max-w-[16rem] text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function CodeViewer({ slug, path }: { slug: string; path: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-file", slug, path],
    queryFn: () => api.getPublicFile(slug, path),
    staleTime: Infinity,
  });

  const tokens = useMemo(
    () => (data && !data.binary && data.content.length <= MAX_HIGHLIGHT_CHARS ? highlightCode(data.content, path) : null),
    [data, path]
  );

  if (isLoading) {
    return (
      <div role="status" aria-label="Opening the file" className="app-loading flex h-full items-center justify-center">
        <OrbitSpinner className="h-5 w-5" />
      </div>
    );
  }
  if (error || !data) {
    return <ViewerNote tone="alert">{error instanceof ApiRequestError ? error.message : "This file couldn't be loaded."}</ViewerNote>;
  }
  if (data.binary) {
    return <ViewerNote>This is a binary file, so there is no code to show.</ViewerNote>;
  }
  return (
    <pre className="h-full overflow-auto p-4 font-mono text-[12.5px] leading-5" aria-label={`Code of ${path}`}>
      <code>
        {tokens
          ? tokens.map((token, i) => (token.cls ? <span key={i} className={token.cls}>{token.text}</span> : token.text))
          : data.content}
      </code>
    </pre>
  );
}

export function SharedApp() {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [isForking, setIsForking] = useState(false);

  const app = useQuery({ queryKey: ["public-app", slug], queryFn: () => api.getPublicApp(slug), retry: false });
  const files = useQuery({
    queryKey: ["public-files", slug],
    queryFn: () => api.getPublicFiles(slug),
    enabled: app.isSuccess,
    retry: false,
  });

  const tree = useMemo(() => buildFileTree((files.data ?? []).map((file) => file.path)), [files.data]);
  const changed = useMemo(() => new Set<string>(), []);

  useEffect(() => {
    if (selected || !files.data?.length) return;
    const paths = files.data.map((file) => file.path);
    setSelected(FIRST_FILES.find((path) => paths.includes(path)) ?? paths[0]);
  }, [files.data, selected]);

  const fork = async () => {
    if (!isAuthenticated()) {
      navigate(loginWithNext(sharePath(slug)));
      return;
    }
    setIsForking(true);
    try {
      const project = await api.forkPublicApp(slug);
      navigate(`/projects/${project.id}`);
    } catch (error) {
      if (isQuotaError(error) && error.quota) {
        toast({
          title: `The ${error.quota.planName} plan includes ${error.quota.limit} ${error.quota.limit === 1 ? "project" : "projects"}`,
          description: "Delete one you've finished with, or upgrade, to make room for the fork.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Couldn't fork this app", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
      }
    } finally {
      setIsForking(false);
    }
  };

  if (app.isLoading) {
    return <AppLoading label="Opening the app" />;
  }

  if (app.isError || !app.data) {
    const missing = app.error instanceof ApiRequestError && app.error.status === 404;
    return (
      <StatusScreen
        alert
        eyebrow={missing ? "Shared app" : "Connection"}
        title={missing ? "This app isn't" : "Couldn't load"}
        accent={missing ? "shared" : "this app"}
        actions={
          <>
            {!missing && (
              <Button variant="chip" onClick={() => void app.refetch()} disabled={app.isFetching} className="gap-1.5">
                {app.isFetching ? <OrbitSpinner /> : <RotateCcw />}
                {app.isFetching ? "Trying again" : "Try again"}
              </Button>
            )}
            <Button asChild variant="chip" className="gap-1.5">
              <Link to="/">
                <ArrowLeft />
                Back to Singularity
              </Link>
            </Button>
          </>
        }
      >
        {missing
          ? "The link may be wrong, or its owner hasn't shared the code, or has taken the app down."
          : "Check your connection and try again in a moment."}
      </StatusScreen>
    );
  }

  const data = app.data;
  return (
    <div className="dash-night ws-shell flex h-screen flex-col overflow-hidden">
      <div className="ws-stage relative flex min-h-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 px-3">
          <Link to="/" aria-label="Singularity home" className="flex shrink-0 items-center"><HorizonMark className="h-5 w-5" /></Link>
          <span className="h-5 w-5 shrink-0 rounded ring-1 ring-inset ring-white/10" style={generateGradient(data.name)} />
          <h1 className="min-w-0 truncate text-sm font-medium">{data.name}</h1>
          <span className="role-chip hidden shrink-0 sm:inline-flex">Read only</span>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="app-chip inline-flex h-7 items-center gap-1.5 border border-white/[0.12] px-2.5 text-xs text-foreground/90"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open the app
            </a>
            <button
              type="button"
              onClick={() => void fork()}
              disabled={isForking}
              className="app-chip inline-flex h-7 items-center gap-1.5 border border-primary/50 bg-primary/15 px-2.5 text-xs text-foreground disabled:opacity-50"
            >
              {isForking ? <OrbitSpinner /> : <GitFork className="h-3.5 w-3.5" />}
              {isAuthenticated() ? "Fork" : "Sign in to fork"}
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-2 px-2 pb-2 md:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="ws-window min-h-[8rem] overflow-auto" aria-label="Files">
            <FileTree files={tree} selectedPath={selected} onSelectFile={setSelected} isLoading={files.isLoading} changedPaths={changed} />
            {files.isError && (
              <p role="alert" className="app-fade p-3 text-xs leading-relaxed text-muted-foreground">
                The code couldn't be loaded. Reload the page to try again.
              </p>
            )}
          </aside>
          <main className={cn("ws-window min-h-[16rem] min-w-0 overflow-hidden")}>
            {selected ? (
              <CodeViewer slug={slug} path={selected} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {files.isLoading ? <OrbitSpinner className="h-5 w-5" label="Loading the code" /> : "Pick a file to read it."}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
