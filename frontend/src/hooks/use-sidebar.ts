/**
 * Whether the sidebar is pinned, peeking or hidden.
 *
 * Handles: pinning on click (the panel then takes real space) and peeking on hover while unpinned (it floats over the
 * page until the pointer leaves), with a short close delay so crossing the gap between the toggle and the panel does
 * not dismiss it. The pinned choice is remembered in browser storage.
 */
import { useEffect, useRef, useState } from "react";

const SIDEBAR_PINNED_KEY = "sidebar_pinned";
const PEEK_CLOSE_DELAY_MS = 180;

export type SidebarState = "pinned" | "peek" | "hidden";

export function useSidebar() {
  const [isPinned, setIsPinned] = useState(() => localStorage.getItem(SIDEBAR_PINNED_KEY) === "true");
  const [isPeekOpen, setIsPeekOpen] = useState(false);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const isLockedRef = useRef(false);
  const isPointerInPanelRef = useRef(false);
  const suppressPeekRef = useRef(false);

  const state: SidebarState = isPinned ? "pinned" : isPeekOpen ? "peek" : "hidden";

  const openPeek = () => {
    if (isPinned || suppressPeekRef.current) return;
    window.clearTimeout(closeTimerRef.current);
    setIsPeekOpen(true);
  };

  const scheduleClose = () => {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      if (!isLockedRef.current) setIsPeekOpen(false);
    }, PEEK_CLOSE_DELAY_MS);
  };

  const closeNow = () => {
    window.clearTimeout(closeTimerRef.current);
    isLockedRef.current = false;
    setIsPeekOpen(false);
  };

  const togglePin = () => {
    const next = !isPinned;
    setIsPinned(next);
    localStorage.setItem(SIDEBAR_PINNED_KEY, String(next));
    closeNow();
    if (!next) suppressPeekRef.current = true;
  };

  const collapse = () => {
    if (isPinned) {
      setIsPinned(false);
      localStorage.setItem(SIDEBAR_PINNED_KEY, "false");
    }
    closeNow();
    suppressPeekRef.current = true;
  };

  useEffect(() => {
    if (!isPeekOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLockedRef.current) setIsPeekOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPeekOpen]);

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  return {
    state,
    isPinned,
    isPeekOpen,
    togglePin,
    collapse,
    closeNow,
    toggleHandlers: {
      onMouseEnter: openPeek,
      onMouseLeave: () => {
        suppressPeekRef.current = false;
        scheduleClose();
      },
    },
    panelHandlers: {
      onMouseEnter: () => {
        isPointerInPanelRef.current = true;
        openPeek();
      },
      onMouseLeave: () => {
        isPointerInPanelRef.current = false;
        if (!isPinned) scheduleClose();
      },
    },
    onMenuOpenChange: (open: boolean) => {
      isLockedRef.current = open;
      if (!open && !isPointerInPanelRef.current) scheduleClose();
    },
  };
}

export type SidebarController = ReturnType<typeof useSidebar>;
