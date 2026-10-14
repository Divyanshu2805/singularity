/**
 * The window event that asks the sidebar to open its Project invites panel.
 *
 * Handles: naming the one event the "you have an invite" toast dispatches from its View button, so the sidebar (which
 * owns the panel, components/ProjectSidebar.tsx) opens it without the dashboard holding any of its state.
 */
export const OPEN_INVITES_EVENT = "singularity:open-invites";
