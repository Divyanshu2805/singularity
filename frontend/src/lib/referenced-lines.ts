import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

/**
 * The editor's "look here" highlight: the block a chat message, a walkthrough or a code note points at.
 *
 * <p>Lives here rather than inside `CodeEditor` so the decoration logic can be tested against a real
 * `EditorState` - the component around it schedules the dispatch inside `requestAnimationFrame`, which never
 * runs in a hidden tab and so can't be exercised in a headless check.
 */

/** A 1-based, inclusive line range to light up - or null to clear it. */
export const setReferencedLines = StateEffect.define<{ from: number; to: number } | null>();

export const referencedLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(highlight, transaction) {
    for (const effect of transaction.effects) {
      if (!effect.is(setReferencedLines)) continue;
      if (effect.value === null) return Decoration.none;

      const lineCount = transaction.state.doc.lines;
      const from = Math.max(1, effect.value.from);
      if (from > lineCount) return Decoration.none;

      // Every line of the block is decorated, so a multi-line reference lights up whole rather than leaving
      // the reader to work out where the range they clicked actually ends. Clamped to the document, since the
      // range was worked out against the file as it was when the message quoting it was written.
      const to = Math.min(lineCount, Math.max(effect.value.to, from));
      const marks = [];
      for (let line = from; line <= to; line++) {
        marks.push(Decoration.line({ class: "cm-referencedLine" }).range(transaction.state.doc.line(line).from));
      }
      return Decoration.set(marks);
    }
    return highlight.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});
