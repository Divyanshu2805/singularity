/**
 * The lens that follows the pointer over the sign-in page's left-hand (brand) half.
 *
 * Handles: a round piece of barely-there glass (.gravity-lens, index.css) that appears under the pointer when it
 * enters the half it is placed in, sits exactly on it (it is moved in the pointer event itself - an eased follow that
 * trailed the pointer was asked out), and is gone the instant the pointer leaves (it fades in but
 * not out: a fade-out left it hanging on the left half after the pointer had crossed to the form, and the owner asked
 * for that to go; it was also larger and bent harder at first, and was asked smaller and subtler) - and that really bends
 * what is behind it, whatever that is: the nebula, a shooting star, the mark, the name, the demo under them. The bending is
 * an SVG displacement filter run over the lens's backdrop (backdrop-filter: url(#gravity-lens-map)), so nothing under
 * it has to know it is there. The filter reads a displacement map painted once onto a canvas (lensMap): each pixel's
 * red and green say how far to look sideways and upwards for the colour to show, and the map pulls every look towards
 * the centre along a curve that is nothing at the centre, most a little under half-way out and nothing again at the
 * rim - so what is under the lens swells and spreads away from the pointer and meets the untouched page at the rim
 * without a seam. The filter works in sRGB (color-interpolation-filters), since a map read as linear light bends
 * everything sideways. The map goes in as a data: image, which the page's CSP allows for images (csp.ts).
 *
 * It listens on its parent rather than taking pointer events itself (it is pointer-events: none), so the link under
 * it keeps working. A touch never raises it, and under reduced motion it is not rendered at all. Only Chromium runs
 * an SVG filter as a backdrop filter today; elsewhere the glass shows and bends nothing. (The tagline that stood in
 * this half had a letter lens of its own for those browsers, pushing its letters apart; it went with the tagline when
 * the working demo, IdeaForge.tsx, took its place.)
 */
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/components/landing/motion";

const SIZE = 150;
const STRENGTH = 0.3;
const PEAK = 0.2862;
const SCALE = Math.ceil(SIZE * STRENGTH * PEAK) + 2;

function lensMap() {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext("2d");
    if (!context) return "";
    const image = context.createImageData(SIZE, SIZE);
    const radius = SIZE / 2;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const dx = (x + 0.5 - radius) / radius;
            const dy = (y + 0.5 - radius) / radius;
            const r = Math.hypot(dx, dy);
            const pull = r < 1 ? STRENGTH * (1 - r * r) ** 2 * radius : 0;
            const at = (y * SIZE + x) * 4;
            image.data[at] = Math.round(127.5 - ((dx * pull) / SCALE) * 127.5);
            image.data[at + 1] = Math.round(127.5 - ((dy * pull) / SCALE) * 127.5);
            image.data[at + 2] = 128;
            image.data[at + 3] = 255;
        }
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
}

export function GravityLens() {
    const lens = useRef<HTMLDivElement>(null);
    const still = usePrefersReducedMotion();
    const [map, setMap] = useState("");

    useEffect(() => {
        if (!still) setMap(lensMap());
    }, [still]);

    useEffect(() => {
        const node = lens.current;
        const stage = node?.parentElement;
        if (!node || !stage) return;
        const move = (event: PointerEvent) => {
            if (event.pointerType === "touch") return;
            const rect = stage.getBoundingClientRect();
            const x = event.clientX - rect.left - SIZE / 2;
            const y = event.clientY - rect.top - SIZE / 2;
            node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
            node.dataset.on = "true";
        };
        const leave = () => {
            delete node.dataset.on;
        };

        stage.addEventListener("pointermove", move);
        stage.addEventListener("pointerleave", leave);
        return () => {
            stage.removeEventListener("pointermove", move);
            stage.removeEventListener("pointerleave", leave);
        };
    }, [still]);

    if (still) return null;

    return (
        <>
            <svg aria-hidden="true" width="0" height="0" className="pointer-events-none absolute">
                <filter id="gravity-lens-map" x="0" y="0" width={SIZE} height={SIZE} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                    <feImage href={map} x="0" y="0" width={SIZE} height={SIZE} preserveAspectRatio="none" result="map" />
                    <feDisplacementMap in="SourceGraphic" in2="map" scale={SCALE * 2} xChannelSelector="R" yChannelSelector="G" />
                </filter>
            </svg>
            <div ref={lens} aria-hidden="true" className="gravity-lens" style={{ width: SIZE, height: SIZE }} />
        </>
    );
}
