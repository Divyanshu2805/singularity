/**
 * The sky behind the public pages (pricing, the legal pages): a quiet starfield, and a film of grain over it.
 *
 * Handles: scattering stars at three depths that drift at different rates as the page scrolls, giving each star a
 * life of its own - it fades slowly in, holds with a faint twinkle, fades out and, after a pause, is born again
 * somewhere else - the scattered four-point sparks cut from the logo's own spark path, living the same way, the rare
 * gold shooting star, and the grain layer that keeps the black from looking flat.
 *
 * The sky is deliberately sparse and uneven rather than an even dusting: an even field of several hundred twinkling
 * points covered the whole screen and read as noise behind the copy. Stars are placed with a weight that thins them
 * towards the middle of the screen, where the headline and the cards sit, and a share of them gather in a few soft
 * clusters out towards the sides, so the sky has a shape. About a third are anchors that never fade out, so the sky
 * is never empty while the rest come and go; every fade is long and eased, and each star starts at a random point in
 * its life, so the sky never pulses as one. A star keeps its tint when it is born again, which keeps the stars sorted
 * by tint without re-sorting.
 *
 * On a load that opens with the intro (components/motion/intro.ts), the sky's layers fade up from its bare black, so
 * the dark is the first thing on the page. One fixed canvas draws the lot, so the sky costs a single
 * layer however long the page is. It renders at no more than 1.5 device pixels per CSS pixel - the stars are soft
 * dots, and at 2 the redraw every frame cost a high-density screen nearly twice the pixels for nothing visible. A frame
 * allocates nothing outside a passing shooting star: the stars are sorted by tint so the fill colour changes only a
 * handful of times, each star's brightness is the context's global alpha rather than a fresh colour string, and every
 * spark's halo is one pre-rendered glow sprite drawn at its size - building a gradient and hundreds of strings per
 * frame churned the garbage collector into visible hitches while scrolling. Stars wrap vertically instead of being
 * generated for the whole page height. The loop stops while the tab is hidden, and under reduced motion the sky is
 * drawn once and holds still.
 *
 * The signed-in app sits on the same sky in one of two calmer modes. "quiet" (the dashboard, the project lists, the
 * settings pages) keeps a little over half the stars and a few sparks, has no shooting stars, and redraws at about 20
 * frames a second - its stars take seconds to fade, so 60 redraws a second bought nothing an open app should pay for.
 * "still" (the project workspace) draws the sky once and never again: the workspace's panels are glass over it, and a
 * sky that kept moving would make the browser re-blur every panel on every frame.
 */
import { useEffect, useRef } from "react";
import { FADE_IN, INTRO, useIntroChildrenEntrance } from "@/components/motion/intro";
import { usePrefersReducedMotion } from "@/components/motion/motion";

interface Star {
  x: number;
  y: number;
  depth: number;
  size: number;
  phase: number;
  pace: number;
  tint: string;
  anchor: boolean;
  born: number;
  life: number;
  fadeIn: number;
  fadeOut: number;
}

interface Spark extends Star {
  spin: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

interface Cluster {
  x: number;
  y: number;
  r: number;
}

export type SkyMode = "live" | "quiet" | "still";

const QUIET_FRAME_MS = 50;

const TINTS = ["255, 250, 242", "255, 244, 226", "255, 232, 196", "255, 214, 160"];
const ANCHOR_SHARE = 0.35;
const CLUSTER_SHARE = 0.4;
const STAR_CENTRE = 0.2;
const SPARK_CENTRE = 0.04;

const between = (low: number, high: number) => low + Math.random() * (high - low);
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function presence(star: Star, time: number) {
  if (star.anchor) return 1;
  const age = time - star.born;
  if (age <= 0 || age >= star.life) return 0;
  return ease(age / star.fadeIn) * ease((star.life - age) / star.fadeOut);
}

function sparkPath(context: CanvasRenderingContext2D, size: number) {
  const pinch = 0.14 * size;
  context.beginPath();
  context.moveTo(0, -size);
  context.quadraticCurveTo(pinch, -pinch, size, 0);
  context.quadraticCurveTo(pinch, pinch, 0, size);
  context.quadraticCurveTo(-pinch, pinch, -size, 0);
  context.quadraticCurveTo(-pinch, -pinch, 0, -size);
  context.closePath();
}

function Starfield({ mode }: { mode: SkyMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const still = reduced || mode === "still";

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const glow = document.createElement("canvas");
    glow.width = glow.height = 64;
    const glowContext = glow.getContext("2d");
    if (glowContext) {
      const halo = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
      halo.addColorStop(0, "rgba(255, 236, 200, 1)");
      halo.addColorStop(1, "rgba(255, 200, 140, 0)");
      glowContext.fillStyle = halo;
      glowContext.fillRect(0, 0, 64, 64);
    }
    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let sparks: Spark[] = [];
    let clusters: Cluster[] = [];
    let meteor: Meteor | null = null;
    let nextMeteor = 6000;
    let frame = 0;

    const place = (star: Star, centre: number) => {
      for (let tries = 0; tries < 16; tries++) {
        let x = Math.random() * width;
        let y = Math.random() * height;
        if (clusters.length && Math.random() < CLUSTER_SHARE) {
          const cluster = clusters[Math.floor(Math.random() * clusters.length)];
          const reach = cluster.r * Math.sqrt(-2 * Math.log(1 - Math.random() * 0.999));
          const angle = Math.random() * Math.PI * 2;
          x = cluster.x + Math.cos(angle) * reach;
          y = cluster.y + Math.sin(angle) * reach;
        }
        if (x < 0 || x > width) continue;
        const off = Math.abs(x / width - 0.5);
        if (Math.random() < centre + (1 - centre) * ease((off - 0.08) / 0.34)) {
          star.x = x;
          star.y = ((y % height) + height) % height;
          return;
        }
      }
      star.x = (Math.random() < 0.5 ? between(0.02, 0.28) : between(0.72, 0.98)) * width;
      star.y = Math.random() * height;
    };

    const live = (star: Star, now: number, short: boolean) => {
      star.life = short ? between(5000, 11000) : between(8000, 15000);
      star.fadeIn = star.life * between(0.22, 0.32);
      star.fadeOut = star.life * between(0.25, 0.35);
      star.born = now;
    };

    const rebirth = (star: Star, now: number, centre: number, short: boolean) => {
      place(star, centre);
      live(star, now + between(600, short ? 4000 : 6500), short);
      star.phase = Math.random() * Math.PI * 2;
    };

    const scatter = (centre: number, short: boolean): Star => {
      const depth = [0.25, 0.55, 1][Math.floor(Math.random() * 3)];
      const star: Star = {
        x: 0,
        y: 0,
        depth,
        size: (0.35 + Math.random() * 0.7) * (0.6 + depth * 0.55),
        phase: Math.random() * Math.PI * 2,
        pace: 0.0005 + Math.random() * 0.0012,
        tint: TINTS[Math.random() < 0.8 ? Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 2)],
        anchor: false,
        born: 0,
        life: 0,
        fadeIn: 0,
        fadeOut: 0,
      };
      place(star, centre);
      live(star, 0, short);
      star.born = -Math.random() * star.life * 1.25;
      return star;
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const spread = Math.min(width, height);
      clusters = Array.from({ length: 4 }, (_, index) => ({
        x: (index % 2 === 0 ? between(0.04, 0.3) : between(0.7, 0.96)) * width,
        y: between(0.05, 0.95) * height,
        r: between(0.07, 0.14) * spread,
      }));
      const density = mode === "live" ? 1 : 0.55;
      stars = Array.from({ length: Math.round(Math.min(170, (width * height) / 9000) * density) }, () => {
        const star = scatter(STAR_CENTRE, true);
        star.anchor = Math.random() < ANCHOR_SHARE;
        return star;
      }).sort((a, b) => (a.tint < b.tint ? -1 : 1));
      const sparkCount = mode === "live" ? Math.min(7, Math.max(3, width / 300)) : Math.min(4, Math.max(2, width / 480));
      sparks = Array.from({ length: Math.round(sparkCount) }, () => ({
        ...scatter(SPARK_CENTRE, false),
        size: 2.4 + Math.random() * 3.2,
        depth: 0.35 + Math.random() * 0.4,
        spin: (Math.random() - 0.5) * 0.0003,
        pace: 0.0006 + Math.random() * 0.0008,
      }));
    };

    let scroll = window.scrollY;
    const wrap = (star: Star) => {
      const drift = scroll * star.depth * 0.12;
      return (((star.y - drift) % height) + height) % height;
    };

    const draw = (time: number) => {
      scroll = window.scrollY;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";

      let tint = "";
      for (const star of stars) {
        if (!star.anchor && time - star.born >= star.life) rebirth(star, time, STAR_CENTRE, true);
        const shown = presence(star, time);
        if (shown <= 0.002) continue;
        const twinkle = 0.78 + 0.22 * Math.sin(time * star.pace + star.phase);
        if (star.tint !== tint) {
          tint = star.tint;
          context.fillStyle = `rgb(${tint})`;
        }
        context.globalAlpha = shown * twinkle * (0.3 + star.depth * 0.55);
        context.beginPath();
        context.arc(star.x, wrap(star), star.size, 0, Math.PI * 2);
        context.fill();
      }

      for (const spark of sparks) {
        if (time - spark.born >= spark.life) rebirth(spark, time, SPARK_CENTRE, false);
        const shown = presence(spark, time);
        if (shown <= 0.002) continue;
        const pulse = 0.7 + 0.3 * Math.sin(time * spark.pace + spark.phase);
        const y = wrap(spark);
        const reach = spark.size * 3.2;
        context.globalAlpha = 0.22 * pulse * shown;
        context.drawImage(glow, spark.x - reach, y - reach, reach * 2, reach * 2);

        context.save();
        context.translate(spark.x, y);
        context.rotate(time * spark.spin);
        sparkPath(context, spark.size * (0.8 + 0.2 * pulse) * (0.6 + 0.4 * shown));
        context.globalAlpha = (0.45 + 0.45 * pulse) * shown;
        context.fillStyle = `rgb(${spark.tint})`;
        context.fill();
        context.restore();
      }
      context.globalAlpha = 1;

      if (meteor) {
        meteor.age += 1;
        meteor.x += meteor.vx;
        meteor.y += meteor.vy;
        const life = 1 - meteor.age / 70;
        if (life <= 0) {
          meteor = null;
        } else {
          const fade = Math.min(1, meteor.age / 10) * life;
          const trail = context.createLinearGradient(meteor.x, meteor.y, meteor.x - meteor.vx * 16, meteor.y - meteor.vy * 16);
          trail.addColorStop(0, `rgba(255, 244, 224, ${(0.75 * fade).toFixed(3)})`);
          trail.addColorStop(0.3, `rgba(255, 204, 150, ${(0.35 * fade).toFixed(3)})`);
          trail.addColorStop(1, "rgba(255, 180, 110, 0)");
          context.strokeStyle = trail;
          context.lineWidth = 1.2;
          context.beginPath();
          context.moveTo(meteor.x, meteor.y);
          context.lineTo(meteor.x - meteor.vx * 16, meteor.y - meteor.vy * 16);
          context.stroke();
        }
      } else if (mode === "live" && time > nextMeteor) {
        const speed = 6 + Math.random() * 3;
        meteor = {
          x: width * (Math.random() < 0.5 ? between(0.7, 0.95) : between(0.25, 0.45)),
          y: height * between(0.04, 0.3),
          vx: -speed * 0.82,
          vy: speed * 0.45,
          age: 0,
        };
        nextMeteor = time + 14000 + Math.random() * 12000;
      }

      context.globalCompositeOperation = "source-over";
    };

    let drawnAt = Number.NEGATIVE_INFINITY;
    const loop = (time: number) => {
      if (mode !== "quiet" || time - drawnAt >= QUIET_FRAME_MS) {
        drawnAt = time;
        draw(time);
      }
      frame = window.requestAnimationFrame(loop);
    };
    const onVisibility = () => {
      window.cancelAnimationFrame(frame);
      if (!document.hidden && !still) frame = window.requestAnimationFrame(loop);
    };
    const onScrollStill = () => draw(0);

    resize();
    if (still) {
      draw(0);
      window.addEventListener("scroll", onScrollStill, { passive: true });
    } else {
      frame = window.requestAnimationFrame(loop);
    }
    const onResize = () => {
      resize();
      if (still) draw(0);
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScrollStill);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [still, mode]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

export function PageBackdrop({ mode = "live" }: { mode?: SkyMode }) {
  const sky = useRef<HTMLDivElement>(null);
  useIntroChildrenEntrance(sky, FADE_IN, INTRO.sky, "cubic-bezier(0.4, 0, 0.2, 1)");

  return (
    <div ref={sky} aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden bg-[hsl(228_30%_2.2%)]">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            "radial-gradient(70% 50% at 50% 0%, hsl(30 11% 9.9% / 0.55), transparent 70%)",
            "radial-gradient(50% 40% at 100% 100%, hsl(30 11% 8.4% / 0.35), transparent 70%)",
          ].join(", "),
        }}
      />
      <Starfield mode={mode} />
      <div className="landing-grain absolute inset-0" />
    </div>
  );
}
