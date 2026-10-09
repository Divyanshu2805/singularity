/**
 * Lets a box whose contents change size ease to its new height rather than snap to it.
 *
 * Handles: watching the inner element, and writing its height, plus the outer box's own border, onto the outer one
 * as an explicit height, so a CSS transition on height has two numbers to run between (.smooth-height, index.css).
 *
 * The first height is written with no transition, so the box does not grow from nothing as it arrives. Where the
 * browser has no ResizeObserver the box keeps its natural height and simply does not ease.
 */
import { useLayoutEffect, useRef } from "react";

export function useSmoothHeight<Outer extends HTMLElement = HTMLDivElement, Inner extends HTMLElement = HTMLDivElement>() {
    const outerRef = useRef<Outer>(null);
    const innerRef = useRef<Inner>(null);

    useLayoutEffect(() => {
        const outer = outerRef.current;
        const inner = innerRef.current;
        if (!outer || !inner || typeof ResizeObserver === "undefined") return;

        const fit = () => {
            const border = outer.offsetHeight - outer.clientHeight;
            outer.style.height = `${inner.offsetHeight + border}px`;
        };
        const observer = new ResizeObserver(fit);
        observer.observe(inner);
        return () => {
            observer.disconnect();
            outer.style.height = "";
        };
    }, []);

    return { outerRef, innerRef };
}
