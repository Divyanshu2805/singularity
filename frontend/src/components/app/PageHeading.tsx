/**
 * The heading every settings-style page in the app opens with - Usage, Plans & billing, Security, All projects.
 *
 * Handles: a small mono eyebrow, a Fraunces title whose last part is set in italic gold (the landing page's and the
 * dashboard's own voice), a line of description, and the page's own controls on the right; and the entrance - the
 * eyebrow fades up, the title's words drop in one after another (motion.ts's play, the same drop the landing hero
 * and the sign-in pages use), and the description and controls follow - played again whenever the title changes.
 *
 * Under reduced motion it is simply there.
 */
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { HeadlineWords } from "@/components/landing/HeadlineWords";
import { WORD_DROP } from "@/components/landing/intro";
import { play } from "@/components/landing/motion";

export function PageHeading({ eyebrow, title, accent, children, actions }: {
  eyebrow: string;
  title?: string;
  accent: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const words = ref.current?.querySelectorAll("[data-word]");
    if (!words) return;
    return play(words, WORD_DROP, { delay: 80, step: 55, duration: 850 });
  }, [title, accent]);

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <p className="app-eyebrow app-fade" data-align="left">
          {eyebrow}
        </p>
        <h1
          ref={ref}
          className="landing-heading mt-3 font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[40px]"
        >
          {title && (
            <>
              <HeadlineWords text={title} />{" "}
            </>
          )}
          <em data-word className="heat-text inline-block animate-heat-sweep pb-[0.1em] -mb-[0.1em] pr-2 font-medium motion-reduce:animate-none">
            {accent}
          </em>
        </h1>
        {children && (
          <div className="app-fade mt-2 text-sm text-muted-foreground" style={{ "--i": 3 } as CSSProperties}>
            {children}
          </div>
        )}
      </div>
      {actions && (
        <div className="app-fade flex flex-wrap items-center gap-2" style={{ "--i": 4 } as CSSProperties}>
          {actions}
        </div>
      )}
    </div>
  );
}
