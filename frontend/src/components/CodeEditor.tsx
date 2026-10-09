/**
 * The code editor: a CodeMirror view of one project file, read-only until its owner switches editing on.
 *
 * Handles: the language for the file, the app's own syntax theme, the unified diff against a turn's previous version
 * when the diff toggle is on, briefly highlighting and scrolling to the line a chat message, a walkthrough or a
 * note points at, and - when the panel around it has put the file into editing - taking what is typed, handing each
 * change up, and treating Ctrl+S / Cmd+S as Save instead of letting the browser offer to save the page.
 *
 * It never decides by itself that a file may be edited, and it never saves: both belong to CodePanel, which knows
 * who is looking and what version the edit started from.
 *
 * The highlight is applied through an editor state field defined outside this component, so that logic can be tested
 * against a real editor state - the dispatch here is scheduled inside an animation frame, which never runs in a
 * hidden tab.
 *
 * The selection's menu is the app's matte menu - Explain as a small primary button, Ask beside it - and the empty
 * and loading states use the app's quiet tile and comet.
 */
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { unifiedMergeView } from '@codemirror/merge';
import { StateEffect } from '@codemirror/state';

import { FileCode, MessagesSquare, Sparkles } from "lucide-react";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { singularityTheme, diffViewTheme, editorReadabilityTheme, referencedLineTheme } from '@/lib/editor-theme';
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
  diffOriginal?: string | null;
  reveal?: (CodeTarget & { id: number }) | null;
  onSelectionAction?: (selection: CodeSelection, action: "explain" | "ask") => void;
  editable?: boolean;
  onChange?: (value: string) => void;
  onSave?: () => void;
}

interface ToolbarAnchor {
  top: number;
  left: number;
  below: boolean;
}

const MIN_SELECTION_CHARS = 2;
const TOOLBAR_OFFSET_PX = 8;
const TOOLBAR_HEIGHT_PX = 34;

export const CodeEditor = memo(function CodeEditor({ content, filePath, isLoading, diffOriginal, reveal, onSelectionAction, editable, onChange, onSave }: CodeEditorProps) {
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
            mergeControls: false,
            allowInlineDiffs: true,
          }),
          diffViewTheme,
        ]
      : [];
    return [EditorView.lineWrapping, editorReadabilityTheme, referencedLineField, referencedLineTheme, ...languageExtensionsFor(filePath), ...diffExtensions];
  }, [filePath, diffOriginal]);

  const selectionHandlerRef = useRef(onSelectionAction);
  selectionHandlerRef.current = onSelectionAction;

  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!editable || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
    event.preventDefault();
    saveRef.current?.();
  };

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
    const line = findCodeLine(content, reveal.code, reveal.line ?? 1) ?? reveal.line;
    if (!line) {
      revealedIdRef.current = reveal.id;
      return;
    }

    const frame = requestAnimationFrame(() => {
      if (!view.dom.isConnected || line > view.state.doc.lines) return;
      revealedIdRef.current = reveal.id;
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
      <div className="flex h-full items-center justify-center">
        <OrbitSpinner className="h-6 w-6" label="Loading the file" />
      </div>
    );
  }

  if (!filePath) {
    return (
      <div className="chat-enter flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03]">
          <FileCode className="h-5 w-5 text-muted-foreground" />
        </span>
        <p className="text-sm text-muted-foreground">Select a file to view its code</p>
      </div>
    );
  }

  const lineLabel = selection && (selection.startLine === selection.endLine
    ? `Line ${selection.startLine}`
    : `Lines ${selection.startLine}–${selection.endLine}`);

  return (
    <div ref={wrapperRef} onKeyDown={handleKeyDown} className="relative h-full w-full overflow-hidden">
      <CodeMirror
        value={content}
        height="100%"
        theme={singularityTheme}
        editable={!!editable}
        onChange={editable ? onChange : undefined}
        extensions={extensions}
        basicSetup={BASIC_SETUP}
        onCreateEditor={setView}
        className="h-full"
      />

      {selection && anchor && onSelectionAction && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{ top: anchor.top, left: anchor.left, transform: anchor.below ? undefined : "translateY(-100%)" }}
          className="app-menu app-menu-raised absolute z-20 flex items-center gap-1.5 rounded-full border p-1 pl-3.5 animate-in fade-in-0 zoom-in-95 duration-200"
        >
          <span className="mr-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[hsl(40_31.5%_88%/0.7)]">{lineLabel}</span>
          <button
            type="button"
            onClick={() => onSelectionAction(selection, "explain")}
            className="btn btn-primary flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold active:scale-[0.96] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/35"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Explain
          </button>
          <button
            type="button"
            onClick={() => onSelectionAction(selection, "ask")}
            className="btn btn-glass flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold text-foreground/90 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/35"
          >
            <MessagesSquare className="h-3.5 w-3.5" />
            Ask
          </button>
        </div>
      )}
    </div>
  );
});
