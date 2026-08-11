/**
 * Find-in-files for a project.
 *
 * Handles: the query box, debouncing it, running the search and listing each file's matches, and opening a hit at its
 * line - passing the matched text along so it can be re-found if lines have moved since.
 *
 * The minimum query length keeps single letters from fanning out across every file, and the debounce exists because
 * the search reads every file from storage, so it is not free per keystroke.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { getFileColor, getFileIcon, splitPath } from "@/lib/file-icons";
import type { CodeSearchResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

interface CodeSearchPanelProps {
  projectId: string;
  query: string;
  onQueryChange: (query: string) => void;
  onOpenMatch: (path: string, line: number, text: string) => void;
  activePath: string | null;
}

export function CodeSearchPanel({ projectId, query, onQueryChange, onOpenMatch, activePath }: CodeSearchPanelProps) {
  const [results, setResults] = useState<CodeSearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults(null);
      setError(null);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);
    const timer = window.setTimeout(() => {
      api.searchCode(projectId, trimmed, controller.signal)
        .then((response) => {
          setResults(response);
          setError(null);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError(err instanceof Error ? err.message : "Couldn't search this project");
          setResults(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [projectId, trimmed]);

  const summary = useMemo(() => {
    if (!results) return null;
    if (results.matchCount === 0) return "No matches";
    const matches = `${results.matchCount}${results.truncated ? "+" : ""} match${results.matchCount === 1 ? "" : "es"}`;
    return `${matches} in ${results.fileCount} file${results.fileCount === 1 ? "" : "s"}`;
  }, [results]);

  const unavailableCount = results?.unavailablePaths.length ?? 0;

  const hasQuery = trimmed.length > 0;

  return (
    <>
      <form
        role="search"
        onSubmit={(e) => e.preventDefault()}
        className="shrink-0 border-b border-border/50 px-2 py-2"
      >
        <div className="flex h-7 items-center gap-1.5 rounded-md border border-border/80 bg-background/60 px-2 transition-colors focus-within:border-primary/50">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                e.stopPropagation();
                onQueryChange("");
              }
            }}
            placeholder="Find in files…"
            aria-label="Search code in this project"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground caret-primary outline-none placeholder:text-muted-foreground/70"
          />
          {isSearching ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
          ) : query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onQueryChange("")}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-primary"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
        {hasQuery && summary && (
          <p className="px-0.5 pt-1.5 text-[10px] text-muted-foreground">
            {summary}
            {results?.truncated && " · refine to see the rest"}
            {unavailableCount > 0 &&
              ` · ${unavailableCount} file${unavailableCount === 1 ? "" : "s"} couldn't be searched`}
          </p>
        )}
      </form>

      {hasQuery && (
        <div className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
          {error && <p className="px-3 py-2 text-[11px] text-destructive">{error}</p>}

          {!error && trimmed.length < MIN_QUERY_LENGTH && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">Keep typing…</p>
          )}

          {results?.files.map((file) => {
            const Icon = getFileIcon(file.path);
            const { dir, base } = splitPath(file.path);
            return (
              <div key={file.path} className="pb-1">
                <div
                  title={file.path}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 text-[11px]",
                    file.path === activePath ? "text-primary" : "text-foreground/80"
                  )}
                >
                  <Icon className={cn("h-3 w-3 shrink-0", getFileColor(file.path))} />
                  <span className="truncate font-medium">{base}</span>
                  <span className="truncate text-muted-foreground/70">{dir}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                    {file.matches.length}
                    {file.truncated && "+"}
                  </span>
                </div>
                <ul>
                  {file.matches.map((match) => (
                    <li key={`${match.line}-${match.column}`}>
                      <button
                        type="button"
                        onClick={() => onOpenMatch(file.path, match.line, match.text)}
                        title={`${file.path}:${match.line}`}
                        className="group flex w-full items-baseline gap-2 px-2 py-0.5 pl-6 text-left transition-colors hover:bg-primary/10"
                      >
                        <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/60">
                          {match.line}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground group-hover:text-foreground">
                          {match.text.slice(0, match.column)}
                          <mark className="rounded-sm bg-primary/25 px-px text-foreground">
                            {match.text.slice(match.column, match.column + match.length)}
                          </mark>
                          {match.text.slice(match.column + match.length)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
