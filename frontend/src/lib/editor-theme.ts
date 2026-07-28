/**
 * The code editor's colours.
 *
 * Handles: the syntax theme, the highlight applied to lines a chat message points at, and the recolouring of the
 * merge view's diff decorations.
 *
 * It reads straight from the app's own CSS custom properties, so the editor always matches the surrounding UI instead
 * of carrying a separate palette that would drift.
 */
import { createTheme } from '@uiw/codemirror-themes';
import { tags as t } from '@lezer/highlight';
import { EditorView } from '@codemirror/view';

export const vibecraftTheme = createTheme({
  theme: 'dark',
  settings: {
    background: 'hsl(var(--panel))',
    foreground: 'hsl(var(--foreground))',
    caret: 'hsl(var(--primary))',
    selection: 'hsl(var(--primary) / 0.25)',
    selectionMatch: 'hsl(var(--primary) / 0.15)',
    lineHighlight: 'hsl(var(--panel-hover) / 0.6)',
    gutterBackground: 'hsl(var(--panel))',
    gutterForeground: 'hsl(var(--muted-foreground))',
    gutterActiveForeground: 'hsl(var(--foreground))',
    gutterBorder: 'transparent',
    fontFamily: 'var(--font-mono)',
  },
  styles: [
    { tag: t.comment, color: 'hsl(var(--syntax-comment))', fontStyle: 'italic' },
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

export const referencedLineTheme = EditorView.theme({
  '.cm-referencedLine': {
    backgroundColor: 'hsl(var(--primary) / 0.2)',
    boxShadow: 'inset 3px 0 0 hsl(var(--primary))',
  },
});

export const diffViewTheme = EditorView.theme({
  '.cm-deletedLine, .cm-deletedLine .cm-changedText': {
    backgroundColor: 'hsl(6 62% 50% / 0.14)',
  },
  '.cm-deletedText': {
    backgroundColor: 'hsl(6 62% 50% / 0.32)',
    textDecoration: 'none',
    borderRadius: '2px',
  },
  '.cm-insertedLine': {
    backgroundColor: 'hsl(88 30% 55% / 0.16)',
  },
  '.cm-insertedLine .cm-changedText': {
    backgroundColor: 'hsl(88 30% 55% / 0.34)',
    borderRadius: '2px',
  },
  '.cm-changeGutter': {
    width: '6px',
  },
  '.cm-deletedLineGutter': {
    backgroundColor: 'hsl(6 62% 50% / 0.5)',
  },
  '.cm-insertedLineGutter, .cm-changedLineGutter': {
    backgroundColor: 'hsl(88 30% 55% / 0.5)',
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
