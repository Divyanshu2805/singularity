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
 * of its own (six to eleven seconds) while the whole wash breathes every seven, and it flows as Lovable's does: every
 * glow's centre drifts sideways and up and down on a clock of its own, and the field is rippled by two slow sines, so
 * the edges of the colour wave rather than only brighten (the owner asked for that movement once the wash was back
 * and found it stood too still). A brighter gold glow also wanders across the middle. It took the place of a nebula of gas (a domain-warped noise shader with filaments and dust lanes, which
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
 * Over the wash, on every page (glints), a third canvas holds a few dozen tiny points that
 * twinkle quickly, in the dark upper sky and thickest at the top, none over the colour at the foot (the owner
 * asked for them in the black, after a first version put them in the colour; scatterGlints in lib/nebula-stars.ts).
 *
 * wash={false} leaves the colour out and keeps the stars, glints and shooting star (the sign-in page's form panel).
 *
 * The loop stops while the tab is hidden, and under reduced motion both layers are drawn once and hold still. The
 * surfaces over all this are tinted, never blurred (index.css, .dash-night), so nothing re-blurs as it moves. The CSS
 * on .nebula fixes the sky to the window and fades it in when the page opens. A page that already stands on the
 * quiet starfield (PageBackdrop - the signed-out pricing page, the sign-in page) passes stars={false} and gets the wash alone.
 *
 * The dashboard passes strong, as the owner asked for its colour to be as bold as Lovable's: the same motion, but every
 * glow reaches half again as high, stands a little higher and is laid on more thickly, and a hot pale-gold core
 * (HOT) drifts along the foot (uBoost in the shader; data-strong lets index.css brighten the fallback gradient too).
 *
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FULLSCREEN_VERTEX, createProgram } from "@/components/motion/glsl";
import { usePrefersReducedMotion } from "@/components/motion/motion";
import { STAR_TINTS, glintCount, scatterGlints, scatterStars, starCount, type NebulaGlint, type NebulaStar } from "@/lib/nebula-stars";
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
uniform float uBoost;

const vec3 WEST = vec3(0.664, 0.136, 0.294);
const vec3 HOT = vec3(1.0, 0.86, 0.5);
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

  vec2 flow = uv;
  flow.x += 0.05 * sin(uv.y * 5.0 + t * 0.8) + 0.03 * sin(uv.y * 9.0 - t * 1.1);
  flow.y += 0.035 * sin(uv.x * 6.0 + t * 0.7);

  float westX = 0.02 + 0.2 * (0.5 + 0.5 * sin(t * 0.47 + 0.6));
  float midX = 0.5 + 0.3 * sin(t * 0.41 + 1.0);
  float eastX = 0.98 - 0.2 * (0.5 + 0.5 * sin(t * 0.43 + 2.2));
  float roamX = 0.5 + 0.38 * sin(t * 0.52);

  float rise = 1.0 + 0.5 * uBoost;
  float gain = 1.0 + 0.4 * uBoost;
  float lift = 0.06 * uBoost;

  vec4 sky = vec4(0.0);
  lay(sky, LIFT, min(1.0, 0.46 * gain) * smoothstep(0.78 + 0.12 * uBoost, 0.0, uv.y) * (0.8 + 0.2 * tide));
  lay(sky, MID, min(1.0, 0.7 * gain * (0.5 + 0.5 * mid)) * glow(flow, vec2(midX, -0.12 + lift + 0.08 * sin(t * 0.6)), vec2(0.72, 0.62 * rise * swell * (0.88 + 0.24 * mid))));
  lay(sky, EAST, min(1.0, 0.68 * gain * (0.46 + 0.54 * east)) * glow(flow, vec2(eastX, -0.1 + lift + 0.07 * sin(t * 0.5 + 1.7)), vec2(0.78, 0.82 * rise * swell * (0.86 + 0.26 * east))));
  lay(sky, WEST, min(1.0, 0.78 * gain * (0.46 + 0.54 * west)) * glow(flow, vec2(westX, -0.08 + lift + 0.07 * sin(t * 0.55 + 3.1)), vec2(0.66, 0.8 * rise * swell * (0.86 + 0.26 * west))));
  lay(sky, ROAM, min(1.0, 0.4 * gain * (0.25 + 0.75 * tide)) * glow(flow, vec2(roamX, -0.1 + lift), vec2(0.6, 0.54 * rise * swell)));
  lay(sky, HOT, 0.5 * uBoost * (0.6 + 0.4 * tide) * glow(flow, vec2(0.5 + 0.22 * sin(t * 0.37 + 0.8), -0.16), vec2(0.55, 0.4 * swell)));


  sky.rgb += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 110.0 * step(0.004, sky.a);
  gl_FragColor = vec4(max(sky.rgb, 0.0), sky.a);
}
`;

interface Painter {
    resize: () => void;
    draw: (time: number) => void;
    dispose: () => void;
}

function washPainter(canvas: HTMLCanvasElement, boost: number): Painter | null {
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!gl) return null;
    const built = createProgram(gl, FULLSCREEN_VERTEX, WASH_FRAGMENT);
    if (!built) return null;

    const uResolution = gl.getUniformLocation(built.program, "uResolution");
    const uTime = gl.getUniformLocation(built.program, "uTime");
    gl.uniform1f(gl.getUniformLocation(built.program, "uBoost"), boost);

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

function glintPainter(canvas: HTMLCanvasElement): Painter | null {
    const context = canvas.getContext("2d");
    if (!context) return null;
    const glow = paintGlow();
    let glints: NebulaGlint[] = [];
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
            const count = glintCount(width, height);
            if (count !== glints.length) glints = scatterGlints(count);
        },
        draw: (time) => {
            context.clearRect(0, 0, width, height);
            context.fillStyle = "rgb(255, 246, 226)";
            for (const glint of glints) {
                const x = glint.x * width;
                const y = glint.y * height;
                const wave = 0.5 + 0.5 * Math.sin(time * glint.pace + glint.phase);
                const shine = glint.alpha * (0.12 + 0.88 * wave * wave);
                const reach = glint.radius * 4.2;
                context.globalAlpha = shine * 0.38;
                context.drawImage(glow, x - reach, y - reach, reach * 2, reach * 2);
                if (glint.flare && wave > 0.5) {
                    const arm = reach * 2.4 * wave;
                    context.globalAlpha = shine * 0.6;
                    context.drawImage(glow, x - arm, y - 0.6, arm * 2, 1.2);
                    context.drawImage(glow, x - 0.6, y - arm, 1.2, arm * 2);
                }
                context.globalAlpha = shine;
                context.beginPath();
                context.arc(x, y, glint.radius, 0, Math.PI * 2);
                context.fill();
            }
            context.globalAlpha = 1;
        },
        dispose: () => {},
    };
}

export function Nebula({ className, stars = true, strong = false, glints = true, wash = true }: { className?: string; stars?: boolean; strong?: boolean; glints?: boolean; wash?: boolean }) {
    const skyRef = useRef<HTMLDivElement>(null);
    const cloudRef = useRef<HTMLCanvasElement>(null);
    const starRef = useRef<HTMLCanvasElement>(null);
    const glintRef = useRef<HTMLCanvasElement>(null);
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
        const clouds = wash && cloudRef.current ? washPainter(cloudRef.current, strong ? 1 : 0) : null;
        const points = starRef.current ? starPainter(starRef.current) : null;
        const sparks = glintRef.current ? glintPainter(glintRef.current) : null;
        if (cloudRef.current && !clouds) setFlat(true);
        if (!sky || (!clouds && !points && !sparks)) return;

        let animation = 0;
        let cloudsAt = Number.NEGATIVE_INFINITY;
        let pointsAt = Number.NEGATIVE_INFINITY;

        const drawAll = (time: number) => {
            cloudsAt = pointsAt = time;
            clouds?.draw(time);
            points?.draw(time);
            sparks?.draw(time);
        };

        const resize = () => {
            clouds?.resize();
            points?.resize();
            sparks?.resize();
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
                sparks?.draw(time);
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
            sparks?.dispose();
        };
    }, [still, stars, strong, glints, wash]);

    return (
        <div ref={skyRef} aria-hidden="true" data-strong={strong || undefined} className={cn("nebula", className)}>
            {stars && <canvas ref={starRef} className="nebula-stars" />}
            {shoot && (
                <span
                    key={shoot.id}
                    className="sky-shoot"
                    style={{ top: shoot.top, left: shoot.left, "--angle": shoot.angle } as CSSProperties}
                />
            )}
            {wash && (flat ? <div className="nebula-tint" /> : <canvas ref={cloudRef} className="nebula-wash" />)}
            {glints && <canvas ref={glintRef} className="nebula-stars" />}
        </div>
    );
}
