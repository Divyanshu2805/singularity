import { memo, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { unifiedMergeView } from '@codemirror/merge';
import { StateEffect } from '@codemirror/state';

import { FileCode, Loader2, MessagesSquare, Sparkles } from "lucide-react";
import { vibecraftTheme, diffViewTheme, referencedLineTheme } from '@/lib/editor-theme';
import { findCodeLine, type CodeTarget } from '@/lib/lesson';
import { referencedLineField, setReferencedLines } from '@/lib/referenced-lines';
import type { CodeSelection } from '@/lib/types';

const BASIC_SETUP = {
  lineNumbers: true,
  foldGutter: true,
  dropCursor: true,
  allowMultipleSelections: true,
  indentOnInput: true,
};

// How long a referenced line stays highlighted - long enough to spot after the scroll, short enough not to linger.
const REFERENCE_HIGHLIGHT_MS = 2600;

function languageExtensionsFor(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return [javascript({ jsx: true, typescript: true })];
    case 'json':
      return [json()];
    case 'css':
    case 'scss':
      return [css()];
    case 'html':
    case 'svg':
      return [javascript({ jsx: true })];
    default:
      return [];
  }
}

interface CodeEditorProps {
  content: string;
  filePath: string | null;
  isLoading?: boolean;
  /** When set, renders `content` as a diff against this baseline instead of plain code. */
  diffOriginal?: string | null;
  /** A line to scroll to and briefly highlight - each new `id` reveals once. */
  reveal?: (CodeTarget & { id: number }) | null;
  /** Selecting code offers "Explain"/"Ask"; omit to turn the code lens off for this editor. */
  onSelectionAction?: (selection: CodeSelection, action: "explain" | "ask") => void;
}

/** Where the selection toolbar sits, in pixels relative to the editor's own box. */
interface ToolbarAnchor {
  top: number;
  left: number;
  /** True when the selection starts near the top, so the toolbar hangs below it instead of off-screen. */
  below: boolean;
}

// Too small a selection is usually a stray drag or a double-clicked word, and a toolbar for it is just noise.
const MIN_SELECTION_CHARS = 2;
const TOOLBAR_OFFSET_PX = 8;
const TOOLBAR_HEIGHT_PX = 34;

// Memoized, with stable extension/setup objects: @uiw/react-codemirror reconfigures and re-highlights
// the editor whenever those change identity, which made it jitter on every streamed chat chunk.
export const CodeEditor = memo(function CodeEditor({ content, filePath, isLoading, diffOriginal, reveal, onSelectionAction }: CodeEditorProps) {
  const [view, setView] = useState<EditorView | null>(null);
  const [selection, setSelection] = useState<CodeSelection | null>(null);
  const [anchor, setAnchor] = useState<ToolbarAnchor | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const revealedIdRef = useRef<number | null>(null);
  const clearHighlightRef = useRef<number | undefined>(undefined);

  const extensions = useMemo(() => {
    if (!filePath) return [];
    const diffExtensions = typeof diffOriginal === "string"
      ? [
          unifiedMergeView({
            original: diffOriginal,
            gutter: false,
            mergeControls: false, // passive preview, not an interactive merge tool
            allowInlineDiffs: true,
          }),
          diffViewTheme,
        ]
      : [];
    // Long lines wrap onto the next line instead of scrolling sideways.
    return [EditorView.lineWrapping, referencedLineField, referencedLineTheme, ...languageExtensionsFor(filePath), ...diffExtensions];
  }, [filePath, diffOriginal]);

  // A ref, not a dependency: rebuilding `extensions` on every render would reconfigure and re-highlight the
  // whole editor (the reason this component is memoized with stable extensions in the first place).
  const selectionHandlerRef = useRef(onSelectionAction);
  selectionHandlerRef.current = onSelectionAction;

  // Clear a stale toolbar when the file changes - the old selection's coordinates mean nothing in a new file.
  useEffect(() => {
    setSelection(null);
    setAnchor(null);
  }, [filePath]);

  useEffect(() => {
    if (!view || !filePath || !onSelectionAction) return;

    const readSelection = () => {
      const range = view.state.selection.main;
      const text = view.state.sliceDoc(range.from, range.to);

      if (range.empty || text.trim().length < MIN_SELECTION_CHARS) {
        setSelection(null);
        setAnchor(null);
        return;
      }

      const wrapper = wrapperRef.current;
      const start = view.coordsAtPos(range.from);
      const box = wrapper?.getBoundingClientRect();
      if (!start || !box) return;

      // Anchored to where the selection starts, so the toolbar never lands under the reader's cursor.
      const top = start.top - box.top;
      const below = top < TOOLBAR_HEIGHT_PX + TOOLBAR_OFFSET_PX;

      setSelection({
        path: filePath,
        code: text,
        startLine: view.state.doc.lineAt(range.from).number,
        endLine: view.state.doc.lineAt(range.to).number,
      });
      setAnchor({
        top: below ? start.bottom - box.top + TOOLBAR_OFFSET_PX : top - TOOLBAR_OFFSET_PX,
        left: Math.max(8, start.left - box.left),
        below,
      });
    };

    // Selection changes arrive as transactions; scrolling moves the anchor without one.
    const onScroll = () => readSelection();
    const listener = EditorView.updateListener.of((update) => {
      if (update.selectionSet || update.docChanged || update.geometryChanged) readSelection();
    });

    view.dispatch({ effects: StateEffect.appendConfig.of(listener) });
    const scroller = view.scrollDOM;
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [view, filePath, onSelectionAction]);

  useEffect(() => {
    if (!view || !reveal || isLoading || revealedIdRef.current === reveal.id) return;
    // Searched for again in what's on screen now: the chat quoted the file as that response wrote it, and a later one
    // may have moved the line. The number from back then is only the fallback.
    const line = findCodeLine(content, reveal.code, reveal.line ?? 1) ?? reveal.line;
    if (!line) {
      revealedIdRef.current = reveal.id;
      return;
    }

    // A frame later, so the editor has taken the new content in before we measure and scroll it.
    const frame = requestAnimationFrame(() => {
      // Right after a remount the previous, destroyed view can still be in state - wait for the new one.
      if (!view.dom.isConnected || line > view.state.doc.lines) return;
      revealedIdRef.current = reveal.id;
      // A range highlights end to end; a single reference is just a one-line range.
      const lastLine = Math.min(view.state.doc.lines, Math.max(reveal.endLine ?? line, line));
      view.dispatch({
        effects: [
          setReferencedLines.of({ from: line, to: lastLine }),
          EditorView.scrollIntoView(view.state.doc.line(line).from, { y: "center" }),
        ],
      });
      window.clearTimeout(clearHighlightRef.current);
      clearHighlightRef.current = window.setTimeout(() => {
        if (view.dom.isConnected) view.dispatch({ effects: setReferencedLines.of(null) });
      }, REFERENCE_HIGHLIGHT_MS);
    });
    return () => cancelAnimationFrame(frame);
  }, [view, reveal, content, isLoading]);

  useEffect(() => () => window.clearTimeout(clearHighlightRef.current), []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-panel">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!filePath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-panel p-8 text-center">
        <FileCode className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Select a file to view its code</p>
      </div>
    );
  }

  const lineLabel = selection && (selection.startLine === selection.endLine
    ? `line ${selection.startLine}`
    : `lines ${selection.startLine}-${selection.endLine}`);

  return (
    <div ref={wrapperRef} className="relative h-full w-full overflow-hidden">
      <CodeMirror
        value={content}
        height="100%"
        theme={vibecraftTheme}
        editable={false}
        extensions={extensions}
        basicSetup={BASIC_SETUP}
        onCreateEditor={setView}
        className="text-sm h-full"
      />

      {selection && anchor && onSelectionAction && (
        <div
          // Keeps the browser from collapsing the selection before the click lands.
          onMouseDown={(e) => e.preventDefault()}
          style={{ top: anchor.top, left: anchor.left, transform: anchor.below ? undefined : "translateY(-100%)" }}
          className="absolute z-20 flex items-center gap-0.5 rounded-lg border border-border/80 bg-popover/95 p-1 shadow-xl shadow-black/40 backdrop-blur animate-in fade-in-0 zoom-in-95 duration-100"
        >
          <span className="px-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
            {lineLabel}
          </span>
          <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border/70" />
          <button
            type="button"
            onClick={() => onSelectionAction(selection, "explain")}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-foreground/90 transition-colors hover:bg-primary/15 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Explain
          </button>
          <button
            type="button"
            onClick={() => onSelectionAction(selection, "ask")}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
          >
            <MessagesSquare className="h-3.5 w-3.5" />
            Ask
          </button>
        </div>
      )}
    </div>
  );
});
