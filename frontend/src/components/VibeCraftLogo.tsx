/**
 * The animated wordmark in the sidebar.
 *
 * Handles: the build-up - tile, then mark, then spark, then name - played forwards on open and backwards and quicker
 * on close, so it finishes before the sidebar has slid away. It respects a reduced-motion preference.
 */
import { useEffect, useId, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT = "cubic-bezier(0.32, 0.72, 0, 1)";
const EASE_POP = "cubic-bezier(0.34, 1.56, 0.64, 1)";

function timing(drawn: boolean, open: { delay: number; duration: number }, close: { delay: number; duration: number }) {
  return drawn ? open : close;
}

const centered: CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };

interface LogoMarkProps {
  className?: string;
  title?: string;
  drawn?: boolean;
}

export function LogoMark({ className, title, drawn }: LogoMarkProps) {
  const gradientId = `vc-logo-${useId().replace(/:/g, "")}`;
  const isAnimated = drawn !== undefined;
  const isDrawn = drawn ?? true;

  const tile = timing(isDrawn, { delay: 0, duration: 420 }, { delay: 140, duration: 220 });
  const stroke = timing(isDrawn, { delay: 140, duration: 380 }, { delay: 60, duration: 180 });
  const spark = timing(isDrawn, { delay: 380, duration: 460 }, { delay: 0, duration: 160 });

  const tileStyle: CSSProperties | undefined = isAnimated
    ? {
        ...centered,
        transform: isDrawn ? "scale(1) rotate(0deg)" : "scale(0.45) rotate(-90deg)",
        opacity: isDrawn ? 1 : 0,
        transition: `transform ${tile.duration}ms ${EASE_POP} ${tile.delay}ms, opacity ${Math.round(tile.duration / 2)}ms linear ${tile.delay}ms`,
      }
    : undefined;

  const strokeStyle: CSSProperties | undefined = isAnimated
    ? {
        strokeDasharray: "1 2",
        strokeDashoffset: isDrawn ? 0 : 1.02,
        opacity: isDrawn ? 1 : 0,
        transition: `stroke-dashoffset ${stroke.duration}ms ${EASE_OUT} ${stroke.delay}ms, opacity 60ms linear ${isDrawn ? stroke.delay : stroke.delay + stroke.duration}ms`,
      }
    : undefined;

  const sparkStyle: CSSProperties | undefined = isAnimated
    ? {
        ...centered,
        transform: isDrawn ? "scale(1) rotate(0deg)" : "scale(0) rotate(-135deg)",
        transition: `transform ${spark.duration}ms ${EASE_POP} ${spark.delay}ms`,
      }
    : undefined;

  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("h-6 w-6 shrink-0 overflow-visible", isAnimated && "[&_*]:motion-reduce:!transition-none", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={gradientId} x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="hsl(36 90% 62%)" />
          <stop offset="1" stopColor="hsl(12 72% 47%)" />
        </linearGradient>
      </defs>
      <g style={tileStyle}>
        <rect x="1" y="1" width="30" height="30" rx="8" fill={`url(#${gradientId})`} />
        <rect x="1.5" y="1.5" width="29" height="29" rx="7.5" fill="none" stroke="white" strokeOpacity="0.18" />
      </g>
      <path
        d="M8.5 11 L16 23.5 L20.4 16"
        pathLength={1}
        fill="none"
        stroke="hsl(25 40% 9%)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={strokeStyle}
      />
      <path
        d="M23.4 6.6 Q23.9 9.7 27 10.2 Q23.9 10.7 23.4 13.8 Q22.9 10.7 19.8 10.2 Q22.9 9.7 23.4 6.6 Z"
        fill="hsl(25 40% 9%)"
        style={sparkStyle}
      />
    </svg>
  );
}

function Wordmark({ drawn, className }: { drawn?: boolean; className?: string }) {
  const isAnimated = drawn !== undefined;
  const isDrawn = drawn ?? true;
  const name = timing(isDrawn, { delay: 220, duration: 420 }, { delay: 0, duration: 180 });

  return (
    <span
      className={cn(isAnimated && "motion-reduce:!transition-none", className)}
      style={
        isAnimated
          ? {
              clipPath: isDrawn ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
              opacity: isDrawn ? 1 : 0,
              transition: `clip-path ${name.duration}ms ${EASE_OUT} ${name.delay}ms, opacity ${name.duration}ms linear ${name.delay}ms`,
            }
          : undefined
      }
    >
      VibeCraft
    </span>
  );
}

export function Logo({ className, drawn }: { className?: string; drawn?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2 text-sm font-semibold tracking-tight", className)}>
      <LogoMark className="h-5 w-5" drawn={drawn} />
      <Wordmark drawn={drawn} />
    </span>
  );
}

const LOOP_BUILT_MS = 4200;
const LOOP_APART_MS = 700;

function useBuildLoop() {
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDrawn(true);
      return;
    }
    let timer: number;
    const show = (next: boolean) => {
      setDrawn(next);
      timer = window.setTimeout(() => show(!next), next ? LOOP_BUILT_MS : LOOP_APART_MS);
    };
    timer = window.setTimeout(() => show(true), 150);
    return () => window.clearTimeout(timer);
  }, []);

  return drawn;
}

function LogoGlow({ drawn }: { drawn: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="absolute -inset-[60%] transition-[opacity,transform] duration-700 ease-out [will-change:opacity,transform] motion-reduce:transition-none"
      style={{
        backgroundImage: "radial-gradient(closest-side, hsl(var(--primary) / 0.45), hsl(var(--primary) / 0.12) 55%, transparent)",
        opacity: drawn ? 1 : 0.2,
        transform: drawn ? "scale(1)" : "scale(0.7)",
      }}
    />
  );
}

export function AnimatedLogoMark({ className, glow, title = "VibeCraft" }: { className?: string; glow?: boolean; title?: string }) {
  const drawn = useBuildLoop();

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {glow && <LogoGlow drawn={drawn} />}
      <LogoMark className="relative h-full w-full" drawn={drawn} title={title} />
    </span>
  );
}

export function AnimatedLogo({ className, markClassName = "h-12 w-12", nameClassName = "text-3xl" }: {
  className?: string;
  markClassName?: string;
  nameClassName?: string;
}) {
  const drawn = useBuildLoop();

  return (
    <span role="img" aria-label="VibeCraft" className={cn("inline-flex items-center gap-3.5", className)}>
      <span className={cn("relative inline-flex shrink-0", markClassName)}>
        <LogoGlow drawn={drawn} />
        <LogoMark className="relative h-full w-full" drawn={drawn} />
      </span>
      <Wordmark drawn={drawn} className={cn("relative font-display font-semibold tracking-tight text-foreground", nameClassName)} />
    </span>
  );
}
