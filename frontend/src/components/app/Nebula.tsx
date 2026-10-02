/**
 * The sky behind the signed-in pages and the sign-in page: a breathing wash of colour standing up from the foot of
 * its box, with stars above it and a shooting star now and then.
 *
 * Handles: the wash's shader (WASH_FRAGMENT), the star layer (the stars from lib/nebula-stars.ts, their halos, the
 * cross of light on the bright ones and their twinkle), the one loop that redraws both, keeping each canvas sized to
 * its box, the timer that sends a shooting star across, and the still gradient that stands in where WebGL is not to
 * be had.
 *
 * The wash is rose at the left, amber in the middle and gold at the right, each glow swelling and dimming on a clock
 * of its own (six to eleven seconds) while the whole wash breathes every seven and a brighter gold glow wanders across
 * the middle. It took the place of a nebula of gas (a domain-warped noise shader with filaments and dust lanes, which
 * is where this file and its class names get their name): the owner tried the wash beside the nebula, asked for it
 * to breathe, then for more yellow and less orange, then for it to replace the nebula on the app's pages, and last on
 * the sign-in page as well, at which point the gas shader and lib/nebula-motion.ts were deleted. The wash is four
 * soft glows and a dither, drawn at three tenths of its box's size about 30 times a second. A first build made each
 * glow a full-window CSS layer animating its transform and opacity; six such layers blended over each other every
 * frame made the page lag for the owner, and its 19 to 34 second clocks were too slow to see, which is why it is one
 * small canvas. Without WebGL the wash is a still gradient (index.css, .nebula-tint).
 *
 * The stars are sharp, so they have a canvas of their own at up to one and a half device pixels per CSS pixel, under
 * the wash; it holds a few hundred dots and is redrawn about 12 times a second, plenty for a twinkle that takes
 * seconds. A frame allocates nothing: halos and flares are one pre-rendered sprite stamped at each star's size. The
 * stars fade out over the last fifth of the page (in the painter, not with a CSS mask, which would be re-applied at
 * every twinkle), since they read as dust on the brightest of the colour. Every 15 to 20 seconds a shooting star
 * crosses the upper sky (.sky-shoot - a span put somewhere new each time and played once, from the left or from the
 * right), on the pages that have stars and not under reduced motion; none is sent while the tab is hidden.
 *
 * The loop stops while the tab is hidden, and under reduced motion both layers are drawn once and hold still. The
 * surfaces over all this are tinted, never blurred (index.css, .dash-night), so nothing re-blurs as it moves. The CSS
 * on .nebula fixes the sky to the window and fades it in when the page opens. A page that already stands on the
 * landing's starfield (the signed-out pricing page, the sign-in page) passes stars={false} and gets the wash alone.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FULLSCREEN_VERTEX, createProgram } from "@/components/landing/glsl";
import { usePrefersReducedMotion } from "@/components/landing/motion";
import { STAR_TINTS, scatterStars, starCount, type NebulaStar } from "@/lib/nebula-stars";
import { cn } from "@/lib/utils";

const WASH_FRAME_MS = 33;
const STAR_FRAME_MS = 80;
const STAR_RATIO = 1.5;
const GLOW_SIZE = 64;
const STILL_TIME = 4000;

const WASH_SCALE = 0.3;
const STAR_SINK = { from: 0.8, to: 1 };
const SHOOT_GAP_MS = { from: 15000, to: 20000 };

type Shoot = { id: number; top: string; left: string; angle: string };

function nextShoot(id: number): Shoot {
    const eastward = Math.random() < 0.5;
    return {
        id,
        top: `${4 + Math.random() * 28}%`,
        left: `${eastward ? 8 + Math.random() * 38 : 54 + Math.random() * 38}%`,
        angle: `${eastward ? 14 + Math.random() * 16 : 166 - Math.random() * 16}deg`,
    };
}

const WASH_FRAGMENT = `
precision mediump float;
uniform vec2 uResolution;
uniform float uTime;

const vec3 WEST = vec3(0.664, 0.136, 0.294);
const vec3 MID = vec3(0.893, 0.46, 0.028);
const vec3 EAST = vec3(0.882, 0.695, 0.018);
const vec3 ROAM = vec3(1.0, 0.804, 0.16);
const vec3 LIFT = vec3(0.316, 0.231, 0.084);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float glow(vec2 uv, vec2 at, vec2 reach) {
  vec2 d = (uv - at) / reach;
  return exp(-6.0 * dot(d, d));
}

void lay(inout vec4 sky, vec3 colour, float amount) {
  sky = sky * (1.0 - amount) + vec4(colour, 1.0) * amount;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float t = uTime;
  float tide = 0.5 + 0.5 * sin(t * 0.9);
  float west = 0.5 + 0.5 * sin(t * 0.71 + 1.3);
  float east = 0.5 + 0.5 * sin(t * 0.58 + 2.9);
  float mid = 0.5 + 0.5 * sin(t * 1.04 + 4.2);
  float swell = 0.86 + 0.2 * tide;

  vec4 sky = vec4(0.0);
  lay(sky, LIFT, 0.46 * smoothstep(0.78, 0.0, uv.y) * (0.8 + 0.2 * tide));
  lay(sky, MID, 0.7 * (0.5 + 0.5 * mid) * glow(uv, vec2(0.5, -0.12), vec2(0.72, 0.62 * swell * (0.88 + 0.24 * mid))));
  lay(sky, EAST, 0.68 * (0.46 + 0.54 * east) * glow(uv, vec2(1.0, -0.1), vec2(0.78, 0.82 * swell * (0.86 + 0.26 * east))));
  lay(sky, WEST, 0.78 * (0.46 + 0.54 * west) * glow(uv, vec2(0.0, -0.08), vec2(0.66, 0.8 * swell * (0.86 + 0.26 * west))));
  lay(sky, ROAM, 0.4 * (0.25 + 0.75 * tide) * glow(uv, vec2(0.5 + 0.2 * sin(t * 0.31), -0.1), vec2(0.6, 0.54 * swell)));

  sky.rgb += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 110.0 * step(0.004, sky.a);
  gl_FragColor = vec4(max(sky.rgb, 0.0), sky.a);
}
`;

interface Painter {
    resize: () => void;
    draw: (time: number) => void;
    dispose: () => void;
}

function washPainter(canvas: HTMLCanvasElement): Painter | null {
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!gl) return null;
    const built = createProgram(gl, FULLSCREEN_VERTEX, WASH_FRAGMENT);
    if (!built) return null;

    const uResolution = gl.getUniformLocation(built.program, "uResolution");
    const uTime = gl.getUniformLocation(built.program, "uTime");

    return {
        resize: () => {
            const width = Math.max(1, Math.round(canvas.clientWidth * WASH_SCALE));
            const height = Math.max(1, Math.round(canvas.clientHeight * WASH_SCALE));
            if (canvas.width !== width) canvas.width = width;
            if (canvas.height !== height) canvas.height = height;
            gl.viewport(0, 0, width, height);
            gl.uniform2f(uResolution, width, height);
        },
        draw: (time) => {
            gl.uniform1f(uTime, time / 1000);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        },
        dispose: built.dispose,
    };
}

function paintGlow() {
    const glow = document.createElement("canvas");
    glow.width = glow.height = GLOW_SIZE;
    const context = glow.getContext("2d");
    if (!context) return glow;
    const half = GLOW_SIZE / 2;
    const gradient = context.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, "rgba(255, 246, 228, 1)");
    gradient.addColorStop(0.25, "rgba(255, 232, 196, 0.4)");
    gradient.addColorStop(1, "rgba(255, 214, 160, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
    return glow;
}

function starPainter(canvas: HTMLCanvasElement): Painter | null {
    const context = canvas.getContext("2d");
    if (!context) return null;
    const glow = paintGlow();
    let stars: NebulaStar[] = [];
    let width = 0;
    let height = 0;

    return {
        resize: () => {
            const ratio = Math.min(window.devicePixelRatio || 1, STAR_RATIO);
            width = canvas.clientWidth;
            height = canvas.clientHeight;
            canvas.width = Math.max(1, Math.round(width * ratio));
            canvas.height = Math.max(1, Math.round(height * ratio));
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            const count = starCount(width, height);
            if (count !== stars.length) stars = scatterStars(count);
        },
        draw: (time) => {
            context.clearRect(0, 0, width, height);
            let tint = -1;
            for (const star of stars) {
                const x = star.x * width;
                const y = star.y * height;
                const sink = Math.min(Math.max((star.y - STAR_SINK.from) / (STAR_SINK.to - STAR_SINK.from), 0), 1);
                if (sink === 1) continue;
                const shine = star.alpha * (1 - sink * sink * (3 - 2 * sink)) * (0.72 + 0.28 * Math.sin(time * star.pace + star.phase));
                if (star.halo > 0) {
                    const reach = star.radius * star.halo;
                    context.globalAlpha = shine * 0.34;
                    context.drawImage(glow, x - reach, y - reach, reach * 2, reach * 2);
                    if (star.flare) {
                        const arm = reach * 1.9;
                        context.globalAlpha = shine * 0.5;
                        context.drawImage(glow, x - arm, y - 0.7, arm * 2, 1.4);
                        context.drawImage(glow, x - 0.7, y - arm, 1.4, arm * 2);
                    }
                }
                if (star.tint !== tint) {
                    tint = star.tint;
                    context.fillStyle = `rgb(${STAR_TINTS[tint]})`;
                }
                context.globalAlpha = shine;
                context.beginPath();
                context.arc(x, y, star.radius, 0, Math.PI * 2);
                context.fill();
            }
            context.globalAlpha = 1;
        },
        dispose: () => {},
    };
}

export function Nebula({ className, stars = true }: { className?: string; stars?: boolean }) {
    const skyRef = useRef<HTMLDivElement>(null);
    const cloudRef = useRef<HTMLCanvasElement>(null);
    const starRef = useRef<HTMLCanvasElement>(null);
    const still = usePrefersReducedMotion();
    const [flat, setFlat] = useState(false);
    const [shoot, setShoot] = useState<Shoot | null>(null);

    useEffect(() => {
        if (!stars || still) return;
        let timer = 0;
        let count = 0;
        const wait = () => {
            timer = window.setTimeout(() => {
                if (!document.hidden) setShoot(nextShoot((count += 1)));
                wait();
            }, SHOOT_GAP_MS.from + Math.random() * (SHOOT_GAP_MS.to - SHOOT_GAP_MS.from));
        };
        wait();
        return () => window.clearTimeout(timer);
    }, [stars, still]);

    useEffect(() => {
        const sky = skyRef.current;
        const clouds = cloudRef.current ? washPainter(cloudRef.current) : null;
        const points = starRef.current ? starPainter(starRef.current) : null;
        if (cloudRef.current && !clouds) setFlat(true);
        if (!sky || (!clouds && !points)) return;

        let animation = 0;
        let cloudsAt = Number.NEGATIVE_INFINITY;
        let pointsAt = Number.NEGATIVE_INFINITY;

        const drawAll = (time: number) => {
            cloudsAt = pointsAt = time;
            clouds?.draw(time);
            points?.draw(time);
        };

        const resize = () => {
            clouds?.resize();
            points?.resize();
            drawAll(still ? STILL_TIME : performance.now());
        };

        const loop = (time: number) => {
            if (time - cloudsAt >= WASH_FRAME_MS) {
                cloudsAt = time;
                clouds?.draw(time);
            }
            if (time - pointsAt >= STAR_FRAME_MS) {
                pointsAt = time;
                points?.draw(time);
            }
            animation = window.requestAnimationFrame(loop);
        };

        const onVisibility = () => {
            window.cancelAnimationFrame(animation);
            if (!document.hidden && !still) animation = window.requestAnimationFrame(loop);
        };

        const observer = new ResizeObserver(resize);
        observer.observe(sky);
        resize();
        if (!still && !document.hidden) animation = window.requestAnimationFrame(loop);
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            window.cancelAnimationFrame(animation);
            observer.disconnect();
            document.removeEventListener("visibilitychange", onVisibility);
            clouds?.dispose();
            points?.dispose();
        };
    }, [still, stars]);

    return (
        <div ref={skyRef} aria-hidden="true" className={cn("nebula", className)}>
            {stars && <canvas ref={starRef} className="nebula-stars" />}
            {shoot && (
                <span
                    key={shoot.id}
                    className="sky-shoot"
                    style={{ top: shoot.top, left: shoot.left, "--angle": shoot.angle } as CSSProperties}
                />
            )}
            {flat ? <div className="nebula-tint" /> : <canvas ref={cloudRef} className="nebula-wash" />}
        </div>
    );
}
