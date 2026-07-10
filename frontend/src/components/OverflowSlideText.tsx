import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Share of the loop spent gliding one way (see the `slide-peek` keyframes: two 30% glides, the rest resting).
const GLIDE_SHARE = 0.3;

/**
 * One line of text that fades out at the edge when it doesn't fit. While its row - the nearest ancestor
 * with the `group/row` class - is hovered or keyboard-focused, it loops gently: rests at the start, glides
 * to show the end, rests, glides back. Text that fits is left alone.
 */
export function OverflowSlideText({ text, className }: { text: string; className?: string }) {
    const containerRef = useRef<HTMLSpanElement>(null);
    const [overflow, setOverflow] = useState(0);

    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const measure = () => setOverflow(Math.max(0, Math.ceil(el.scrollWidth - el.clientWidth)));
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [text]);

    const isOverflowing = overflow > 0;
    // Longer names travel further, so they glide for longer at roughly the same reading speed.
    const glideMs = 400 + overflow * 10;
    const slideStyle = {
        "--slide-by": `-${overflow}px`,
        "--slide-duration": `${Math.round(glideMs / GLIDE_SHARE)}ms`,
    } as CSSProperties;

    return (
        <span
            ref={containerRef}
            // Reduced-motion users don't get the glide, so they get the full name as a tooltip instead.
            title={isOverflowing ? text : undefined}
            className={cn(
                "block min-w-0 flex-1 overflow-hidden whitespace-nowrap",
                isOverflowing &&
                    "[mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)] group-hover/row:[mask-image:linear-gradient(to_right,transparent,#000_8px,#000_calc(100%-8px),transparent)] group-focus-visible/row:[mask-image:linear-gradient(to_right,transparent,#000_8px,#000_calc(100%-8px),transparent)]",
                className
            )}
        >
            <span
                style={slideStyle}
                className={cn(
                    "inline-block",
                    isOverflowing && "group-hover/row:animate-slide-peek group-focus-visible/row:animate-slide-peek motion-reduce:!animate-none"
                )}
            >
                {text}
            </span>
        </span>
    );
}
