/**
 * The eclipse the sign-in card is headed by, and the eye the password field is shown and hidden with.
 *
 * Handles: Eclipse, a slow solar eclipse that plays on a loop by itself, one whole eclipse about every 44 seconds. A
 * pale white-gold sun with a soft glow; the moon, a plain dark disc, rises onto it from the lower left over twenty
 * seconds (the owner asked for it to happen slowly and be complete in about that), carving it into a narrowing
 * crescent whose own bloom follows its shape, while the sun's glow dims with the light it loses. As the last sliver
 * goes, a bead of light flares where it was - the diamond ring, on the upper right - and the eclipse is total: a fine
 * ring of light hugs the moon's edge, the horizon line draws outwards from it, the corona opens behind and the bead
 * settles into the four-point spark, which leaves the horizon mark (HorizonMark) standing there - the logo, made in
 * front of the visitor. Totality lasts a few seconds; then a second diamond ring flares on the opposite side as the
 * sun comes back, the mark's parts fade, the moon carries on away to the upper right, and the whole sun shines for a
 * few seconds before the next one begins. The moon's path runs along the line from that second bead through the
 * centre to the spark, so the last light before totality is where the spark appears.
 *
 * It is drawn so that nothing lights the moon's face, which reads as a dark planet passing in front of a star: the
 * lit part of the sun is the disc with the moon cut out of it (a mask), its bloom is a blurred copy of that crescent
 * laid under the moon's solid disc, and the ring of totality sits under the moon too, so only its outer edge shows.
 * (A first version stroked the moon's lit limb and kept a faint ring on the sun's edge throughout; both drew light
 * across the dark disc, and it stopped reading as an eclipse. It also followed the form before that, a step per
 * field that would pass, and held at totality - the owner asked for it to creep, and then not to stay.)
 *
 * busy makes the glow breathe faster while a sign-in is in flight; each time slip counts up (a refused attempt) the
 * moon slips back a little and returns. The cycle is one set of CSS animations sharing one duration (index.css, the
 * .eclipse rules), so nothing re-renders while it plays; the slip is a one-off Web Animation. Under reduced motion it
 * is simply shown total - the logo - and holds still.
 *
 * EclipseEye is the password field's show/hide glyph: an eye whose pupil is the sun - eclipsed, a dark disc inside a
 * fine ring, while the password is hidden, and uncovered, a small gold sun, while it shows. The eye blinks as it
 * changes, the moon sliding off or back on while the lids are closed; under reduced motion it simply changes.
 */
import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

const REDUCED = "(prefers-reduced-motion: reduce)";

const C = 32;
const R = 11;
const MOON_R = R + 0.6;
const SPARK = { x: 41.6, y: 21.4, size: 3.6 };
const REACH = Math.hypot(SPARK.x - C, SPARK.y - C);
const TOWARD = { x: (SPARK.x - C) / REACH, y: (SPARK.y - C) / REACH };
const BEAD_IN = { x: C + TOWARD.x * MOON_R, y: C + TOWARD.y * MOON_R };
const BEAD_OUT = { x: C - TOWARD.x * MOON_R, y: C - TOWARD.y * MOON_R };

function sparkPath(x: number, y: number, size: number) {
    const pinch = 0.16 * size;
    return `M ${x} ${y - size} Q ${x + pinch} ${y - pinch} ${x + size} ${y} Q ${x + pinch} ${y + pinch} ${x} ${y + size} Q ${x - pinch} ${y + pinch} ${x - size} ${y} Q ${x - pinch} ${y - pinch} ${x} ${y - size} Z`;
}

const reduced = () => typeof window !== "undefined" && window.matchMedia(REDUCED).matches;

export function Eclipse({ busy, slip = 0, className }: { busy?: boolean; slip?: number; className?: string }) {
    const id = `eclipse-${useId().replace(/:/g, "")}`;
    const svg = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!slip || !svg.current || reduced() || typeof svg.current.animate !== "function") return;
        const running = Array.from(svg.current.querySelectorAll(".eclipse-slip"), (part) =>
            part.animate([{ transform: "translate(0px, 0px)" }, { transform: "translate(-4px, 4.4px)" }, { transform: "translate(0px, 0px)" }], {
                duration: 820,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            })
        );
        return () => running.forEach((animation) => animation.cancel());
    }, [slip]);

    const lit = `url(#${id}-lit)`;
    const sun = `url(#${id}-sun)`;

    return (
        <svg
            ref={svg}
            viewBox="0 0 64 64"
            aria-hidden="true"
            data-busy={busy || undefined}
            className={cn("eclipse shrink-0 overflow-visible", className)}
        >
            <defs>
                <radialGradient id={`${id}-halo`} cx={C} cy={C} r="30" gradientUnits="userSpaceOnUse">
                    <stop offset="0.32" stopColor="hsl(46 100% 86%)" stopOpacity="0.5" />
                    <stop offset="0.56" stopColor="hsl(40 100% 66%)" stopOpacity="0.14" />
                    <stop offset="1" stopColor="hsl(32 100% 54%)" stopOpacity="0" />
                </radialGradient>
                <radialGradient id={`${id}-corona`} cx={C} cy={C} r="30" gradientUnits="userSpaceOnUse">
                    <stop offset="0.36" stopColor="hsl(44 60% 96%)" stopOpacity="0" />
                    <stop offset="0.4" stopColor="hsl(44 60% 96%)" stopOpacity="0.7" />
                    <stop offset="0.53" stopColor="hsl(44 100% 80%)" stopOpacity="0.3" />
                    <stop offset="0.77" stopColor="hsl(36 100% 58%)" stopOpacity="0.09" />
                    <stop offset="1" stopColor="hsl(30 100% 50%)" stopOpacity="0" />
                </radialGradient>
                <radialGradient id={`${id}-sun`} cx="30.5" cy="29.5" r="12.5" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="hsl(50 100% 98%)" />
                    <stop offset="0.55" stopColor="hsl(46 100% 88%)" />
                    <stop offset="0.86" stopColor="hsl(43 100% 75%)" />
                    <stop offset="1" stopColor="hsl(39 100% 64%)" />
                </radialGradient>
                <radialGradient id={`${id}-bead`}>
                    <stop offset="0" stopColor="hsl(50 100% 99%)" />
                    <stop offset="0.4" stopColor="hsl(46 100% 86%)" stopOpacity="0.75" />
                    <stop offset="1" stopColor="hsl(42 100% 70%)" stopOpacity="0" />
                </radialGradient>
                <linearGradient id={`${id}-line`} x1="2" y1="0" x2="62" y2="0" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="hsl(41.4 99.7% 79.8%)" stopOpacity="0" />
                    <stop offset="0.18" stopColor="hsl(41.9 99.8% 82.1%)" stopOpacity="0.4" />
                    <stop offset="0.36" stopColor="hsl(40 40% 95%)" />
                    <stop offset="0.64" stopColor="hsl(40 40% 95%)" />
                    <stop offset="0.82" stopColor="hsl(41.9 99.8% 82.1%)" stopOpacity="0.4" />
                    <stop offset="1" stopColor="hsl(41.4 99.7% 79.8%)" stopOpacity="0" />
                </linearGradient>
                <mask id={`${id}-lit`} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
                    <rect width="64" height="64" fill="white" />
                    <g className="eclipse-slip">
                        <circle className="eclipse-moon" cx={C} cy={C} r={MOON_R} fill="black" />
                    </g>
                </mask>
                <filter id={`${id}-bloom`} x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur stdDeviation="2.4" />
                </filter>
            </defs>

            <g className="eclipse-glow">
                <circle className="eclipse-halo" cx={C} cy={C} r="30" fill={`url(#${id}-halo)`} />
                <ellipse className="eclipse-corona" cx={C} cy={C} rx="31" ry="27" fill={`url(#${id}-corona)`} />
            </g>
            <path className="eclipse-horizon" d={`M 2 ${C} H 62`} stroke={`url(#${id}-line)`} strokeWidth="1.1" strokeLinecap="round" />
            <g className="eclipse-bloom" filter={`url(#${id}-bloom)`}>
                <circle cx={C} cy={C} r={R} fill={sun} mask={lit} />
            </g>
            <circle className="eclipse-ring" cx={C} cy={C} r={MOON_R} fill="none" strokeWidth="1.3" />
            <g className="eclipse-slip">
                <circle className="eclipse-moon eclipse-shadow" cx={C} cy={C} r={MOON_R} />
            </g>
            <circle cx={C} cy={C} r={R} fill={sun} mask={lit} />
            <circle className="eclipse-bead eclipse-bead-in" cx={BEAD_IN.x} cy={BEAD_IN.y} r="3" fill={`url(#${id}-bead)`} />
            <circle className="eclipse-bead eclipse-bead-out" cx={BEAD_OUT.x} cy={BEAD_OUT.y} r="3" fill={`url(#${id}-bead)`} />
            <path className="eclipse-spark" d={sparkPath(SPARK.x, SPARK.y, SPARK.size)} />
        </svg>
    );
}

export function EclipseEye({ open, className }: { open: boolean; className?: string }) {
    const id = `eye-${useId().replace(/:/g, "")}`;
    const eye = useRef<SVGGElement>(null);
    const shown = useRef(open);

    useEffect(() => {
        if (shown.current === open) return;
        shown.current = open;
        if (!eye.current || reduced() || typeof eye.current.animate !== "function") return;
        const blink = eye.current.animate(
            [{ transform: "scaleY(1)" }, { transform: "scaleY(0.1)", offset: 0.45 }, { transform: "scaleY(1)" }],
            { duration: 320, easing: "cubic-bezier(0.4, 0, 0.2, 1)" }
        );
        return () => blink.cancel();
    }, [open]);

    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" data-open={open} className={cn("eclipse-eye overflow-visible", className)}>
            <defs>
                <clipPath id={`${id}-pupil`}>
                    <circle cx="12" cy="12" r="3.55" />
                </clipPath>
            </defs>
            <g ref={eye} className="eclipse-eye-ball">
                <path
                    d="M2.4 12C4.5 7.95 7.9 5.8 12 5.8S19.5 7.95 21.6 12C19.5 16.05 16.1 18.2 12 18.2S4.5 16.05 2.4 12Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                />
                <circle className="eclipse-eye-sun" cx="12" cy="12" r="3.4" />
                <g clipPath={`url(#${id}-pupil)`}>
                    <circle className="eclipse-eye-moon" cx="12" cy="12" r="3.75" />
                </g>
                <circle className="eclipse-eye-ring" cx="12" cy="12" r="3.5" fill="none" strokeWidth="0.95" />
            </g>
        </svg>
    );
}
