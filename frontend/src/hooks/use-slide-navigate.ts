/**
 * The router's navigate, run inside the page slide.
 *
 * Handles: navigating to a path through lib/page-slide's slideTo, so going from the landing page to the sign-in pages
 * slides the page out to the left and bringing the visitor back home slides it the other way. Every other destination,
 * and any browser or visitor the slide doesn't apply to, simply navigates.
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { slideTo } from "@/lib/page-slide";

export function useSlideNavigate() {
  const navigate = useNavigate();
  return useCallback((to: string) => slideTo(to, () => navigate(to)), [navigate]);
}
