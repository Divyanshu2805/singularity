/**
 * Whether the sidebar is open or closed to its icon rail.
 *
 * Handles: the open/closed choice and remembering it in browser storage and toggling and closing it. It has no keyboard shortcut.
 *
 * The sidebar never disappears: closed, it is a rail of icons, the way BitBin's is, so the toggle always has a home in
 * its own head and nothing floats over the page. It used to hide entirely and peek out on hover from a floating
 * toggle; the rail replaced that at the owner's request. With nothing stored yet it starts open on a wide screen and
 * closed on a narrow one, where an open panel lies over the page rather than beside it.
 */
import { useCallback, useState } from "react";

const SIDEBAR_COLLAPSED_KEY = "sidebar_collapsed";
const NARROW_QUERY = "(max-width: 767px)";

function readExpanded() {
  try {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored !== null) return stored !== "true";
  } catch {
    return true;
  }
  return !window.matchMedia(NARROW_QUERY).matches;
}

function storeExpanded(expanded: boolean) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(!expanded));
  } catch {
    return;
  }
}

export const isNarrowScreen = () => window.matchMedia(NARROW_QUERY).matches;

export function useSidebar() {
  const [isExpanded, setIsExpanded] = useState(readExpanded);

  const setExpanded = useCallback((next: boolean) => {
    setIsExpanded(next);
    storeExpanded(next);
  }, []);

  const toggle = useCallback(() => {
    setIsExpanded((current) => {
      storeExpanded(!current);
      return !current;
    });
  }, []);

  const collapse = useCallback(() => setExpanded(false), [setExpanded]);

  return { isExpanded, toggle, collapse };
}

export type SidebarController = ReturnType<typeof useSidebar>;
