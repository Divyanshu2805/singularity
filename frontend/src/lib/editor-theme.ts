/**
 * The code editor's colours.
 *
 * Handles: the syntax theme, the highlight applied to lines a chat message points at, and the recolouring of the
 * merge view's diff decorations.
 *
 * It reads straight from the app's own CSS custom properties, so the editor always matches the surrounding UI instead
 * of carrying a separate palette that would drift. Its own surface is transparent, so the editor takes the colour of
 * the workspace window it sits in (index.css, .ws-window) rather than painting a slightly different block inside it;
 * the current line is a faint warm tint and the selection the app's ice blue (a gold one reads as a search hit), line numbers sit back until their line is active, and
 * comments are a step brighter than the muted text so they stay readable. editorReadabilityTheme sets the reading
 * size - 13.5px at a 1.7 line height, with room above the first line and below the last.
 */
import { createTheme } from '@uiw/codemirror-themes';
import { tags as t } from '@lezer/highlight';
import { EditorView } from '@codemirror/view';

export const singularityTheme = createTheme({
  theme: 'dark',
  settings: {
    background: 'transparent',
    foreground: 'hsl(var(--foreground))',
    caret: 'hsl(var(--primary))',
    selection: 'hsl(212 90% 62% / 0.3)',
    selectionMatch: 'hsl(212 90% 62% / 0.16)',
    lineHighlight: 'hsl(40 60% 80% / 0.05)',
    gutterBackground: 'transparent',
    gutterForeground: 'hsl(var(--muted-foreground) / 0.5)',
    gutterActiveForeground: 'hsl(var(--foreground))',
    gutterBorder: 'transparent',
    fontFamily: 'var(--font-mono)',
  },
  styles: [
    { tag: t.comment, color: 'hsl(30 8.4% 62%)', fontStyle: 'italic' },
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: 'hsl(var(--syntax-keyword))' },
    { tag: [t.string, t.special(t.string)], color: 'hsl(var(--syntax-string))' },
    { tag: [t.number, t.bool, t.null], color: 'hsl(var(--syntax-number))' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'hsl(var(--syntax-function))' },
    { tag: [t.definition(t.variableName), t.variableName], color: 'hsl(var(--foreground))' },
    { tag: t.propertyName, color: 'hsl(var(--syntax-function))' },
    { tag: [t.typeName, t.className, t.namespace], color: 'hsl(var(--primary))' },
    { tag: t.operator, color: 'hsl(var(--syntax-keyword))' },
    { tag: t.punctuation, color: 'hsl(var(--muted-foreground))' },
    { tag: t.tagName, color: 'hsl(var(--primary))' },
    { tag: t.attributeName, color: 'hsl(var(--syntax-number))' },
    { tag: t.angleBracket, color: 'hsl(var(--muted-foreground))' },
    { tag: t.meta, color: 'hsl(var(--syntax-comment))' },
    { tag: t.invalid, color: 'hsl(var(--destructive))' },
  ],
});

export const editorReadabilityTheme = EditorView.theme({
  '&': {
    fontSize: '13.5px',
  },
  '.cm-scroller': {
    lineHeight: '1.7',
  },
  '.cm-content': {
    padding: '12px 0 48px',
  },
  '.cm-gutters': {
    paddingLeft: '6px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
}, { dark: true });

export const referencedLineTheme = EditorView.theme({
  '.cm-referencedLine': {
    backgroundColor: 'hsl(var(--primary) / 0.2)',
    boxShadow: 'inset 3px 0 0 hsl(var(--primary))',
  },
});

export const diffViewTheme = EditorView.theme({
  '.cm-deletedLine, .cm-deletedLine .cm-changedText': {
    backgroundColor: 'hsl(352 62% 50% / 0.14)',
  },
  '.cm-deletedText': {
    backgroundColor: 'hsl(352 62% 50% / 0.32)',
    textDecoration: 'none',
    borderRadius: '2px',
  },
  '.cm-insertedLine': {
    backgroundColor: 'hsl(149 38.5% 54.3% / 0.16)',
  },
  '.cm-insertedLine .cm-changedText': {
    backgroundColor: 'hsl(149 38.5% 54.3% / 0.34)',
    borderRadius: '2px',
  },
  '.cm-changeGutter': {
    width: '6px',
  },
  '.cm-deletedLineGutter': {
    backgroundColor: 'hsl(352 62% 50% / 0.5)',
  },
  '.cm-insertedLineGutter, .cm-changedLineGutter': {
    backgroundColor: 'hsl(149 38.5% 54.3% / 0.5)',
  },
  '.cm-collapsedLines': {
    color: 'hsl(var(--muted-foreground))',
    backgroundColor: 'hsl(var(--muted) / 0.5)',
    cursor: 'pointer',
    padding: '2px 10px',
    fontStyle: 'italic',
    fontSize: '12px',
  },
}, { dark: true });
