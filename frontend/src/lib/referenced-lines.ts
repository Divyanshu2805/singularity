/**
 * The editor's "look here" highlight: the block a chat message, a walkthrough or a code note points at.
 *
 * Handles: the effect that sets or clears the range, and the editor state field that turns it into a decoration,
 * clamped to the document's real line count.
 *
 * It lives here rather than inside the editor component so the decoration logic can be tested against a real editor
 * state - the component schedules its dispatch inside an animation frame, which never runs in a hidden tab and so
 * cannot be exercised headlessly.
 */
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

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
