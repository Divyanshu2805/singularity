/**
 * Closing the app's open menus when the person clicks into a frame - the live preview above all.
 *
 * Handles: noticing that the window lost focus to a frame on the page, and telling every open menu, popover and
 * dropdown that a press landed outside it, so each closes as it would for a press anywhere else.
 *
 * A press inside a frame on another origin happens in that frame's own document: the app's document hears no pointer
 * event at all, so a Radix menu - which closes on a pointerdown outside itself - stayed open over the preview however
 * often the person clicked the page in it. The one thing the app does hear is its window losing focus, with the frame
 * as the focused element. That moment is turned into a pointerdown dispatched on the frame element, which is outside
 * every menu, and Radix's own outside-press handling does the rest - so every menu closes the same way, with nothing
 * added to each.
 *
 * The window losing focus for any other reason - another browser tab, another application - leaves the focused
 * element where it was, not on a frame, and closes nothing.
 */
export function closeMenusWhenAFrameTakesFocus(win: Window = window): () => void {
  const onBlur = () => {
    win.setTimeout(() => {
      const focused = win.document.activeElement;
      if (!focused || focused.tagName !== "IFRAME") return;
      const Press = typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
      focused.dispatchEvent(new Press("pointerdown", { bubbles: true, cancelable: true }));
    }, 0);
  };
  win.addEventListener("blur", onBlur);
  return () => win.removeEventListener("blur", onBlur);
}
