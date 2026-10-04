/**
 * A link that leaves by the page slide.
 *
 * Handles: following the link through useSlideNavigate, so a plain click from the landing page to the sign-in pages
 * (or back home) slides rather than cuts; leaving a modified or middle click - a new tab, a new window - to the browser
 * as usual; and fetching the destination page's code as soon as the pointer or focus reaches the link, so the slide
 * isn't kept waiting on the download once it's clicked.
 *
 * The prefetch imports the same modules App.tsx loads on demand, so the bundler serves the one chunk either way; only
 * the two pages the slide runs between are prefetched.
 */
import { forwardRef, type FocusEvent, type MouseEvent, type PointerEvent } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { useSlideNavigate } from "@/hooks/use-slide-navigate";
import { isAuthPath } from "@/lib/page-slide";

function prefetch(to: string) {
  if (isAuthPath(to)) void import("@/pages/AuthPage");
  else if (to === "/") void import("@/pages/Home");
}

type SlideLinkProps = Omit<LinkProps, "to"> & { to: string };

export const SlideLink = forwardRef<HTMLAnchorElement, SlideLinkProps>(function SlideLink(
  { to, onClick, onPointerEnter, onFocus, ...props },
  ref
) {
  const slide = useSlideNavigate();

  return (
    <Link
      ref={ref}
      to={to}
      onPointerEnter={(event: PointerEvent<HTMLAnchorElement>) => {
        prefetch(to);
        onPointerEnter?.(event);
      }}
      onFocus={(event: FocusEvent<HTMLAnchorElement>) => {
        prefetch(to);
        onFocus?.(event);
      }}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        slide(to);
      }}
      {...props}
    />
  );
});
