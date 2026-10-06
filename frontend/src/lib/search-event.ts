/**
 * The window event that asks the sidebar to open its project search panel.
 *
 * Handles: naming the one event a page's search field dispatches when it is clicked, so the sidebar (which owns the
 * panel, components/ProjectSidebar.tsx) opens it without the page holding any of its state.
 */
export const OPEN_SEARCH_EVENT = "singularity:open-search";
