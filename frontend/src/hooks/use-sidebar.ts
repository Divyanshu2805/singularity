import { useEffect, useRef, useState } from "react";

const SIDEBAR_PINNED_KEY = "sidebar_pinned";
const PEEK_CLOSE_DELAY_MS = 180;

export type SidebarState = "pinned" | "peek" | "hidden";

/**
 * Clicking the toggle pins the sidebar (it takes real space); hovering the toggle while unpinned
 * opens the same panel floating over the page until the pointer leaves.
 */
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
    // Unpinning leaves the pointer over the header toggle - don't instantly reopen it as a hover panel.
    if (!next) suppressPeekRef.current = true;
  };

  /** Gives the space back without toggling it on again - used when a panel opens and needs the room. */
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
    // The account menu renders in a portal outside the panel, so a hover panel must stay open while it's open.
    onMenuOpenChange: (open: boolean) => {
      isLockedRef.current = open;
      if (!open && !isPointerInPanelRef.current) scheduleClose();
    },
  };
}

export type SidebarController = ReturnType<typeof useSidebar>;
