/**
 * The stage every sign-in page is set on.
 *
 * Handles: two halves that read as one scene. The brand half carries the horizon mark (HorizonMark) with the name
 * beside it (BrandName) - the mark hides and replays its build every six seconds, the name never animates - and under
 * it the working demo (IdeaForge.tsx): one line of caption over a small card in which an idea is typed into the app's
 * prompt and the app it asks for is built and goes live, three ideas on a loop, starting once the page's opening has
 * reached FORGE_FROM. Behind that half stands the dashboard's breathing wash of colour at full strength (Nebula's
 * strong, .auth-sky), clipped to the half and running a corner's width under the form's panel, and over it rides the
 * pointer's lens (GravityLens.tsx), which bends what is behind it where the browser can. The form's half (.auth-warm)
 * is a full-height panel in the sidebar's own colour; the form stands in it with no box round it, and what goes in it
 * is AuthForm.tsx's. The page's name is given to screen readers as a hidden heading (title). There is no link home:
 * the root sends visitors here (pages/Index.tsx).
 *
 * A refused attempt shakes the form, and a change of view (the form, the second factor, the inbox check) brings its
 * rows up in turn. The page is laid out to fit a laptop screen without scrolling; when the card grows (the sign-up
 * form's name field) the mark and the card stay centred together.
 *
 * The first sign-in page of a visit opens with a sequence on the intro clock (components/motion/intro.ts): the form and
 * the brand with the demo card fade up together where they stand (APPEAR), over backgrounds that do not move. Only the
 * first page gets it - moving between sign-in pages shouldn't replay it - and arriving by the page slide gets none,
 * since the page comes in already made; a later sign-in page reached any other way rises in softly instead. A click
 * anywhere hurries the sequence to its end, as a key press or a scroll does, and a view that changes mid-sequence
 * finishes the sequence's own animations on those pieces before running its own, so the two never fight over them.
 * The root carries .auth-page, which is how the page slide knows the sign-in page has rendered.
 *
 * Under reduced motion nothing drops, rises, shakes, draws or loops; the page is simply there.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BrandName, HorizonMark } from "@/components/HorizonMark";
import { Nebula } from "@/components/app/Nebula";
import { StardustMotes } from "@/components/auth/AuthForm";
import { GravityLens } from "@/components/auth/GravityLens";
import { IdeaForge } from "@/components/auth/IdeaForge";
import {
    CONTENT_RISE,
    EASE_OUT,
    IntroContext,
    useIntro,
    useIntroClock,
    useIntroEntrance,
} from "@/components/motion/intro";
import { play, usePrefersReducedMotion } from "@/components/motion/motion";
import { isSliding } from "@/lib/page-slide";

type Entrance = "intro" | "soft" | "none";

let introOffered = false;

const CARD = { at: 0, for: 1100 };
const FORGE_FROM = 1100;
const APPEAR: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
const SOFT_RISE: Keyframe[] = [
    { opacity: 0, transform: "translate3d(0, 28px, 0) scale(0.985)" },
    { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
];
const SHAKE: Keyframe[] = [
    { translate: "0 0" },
    { translate: "-7px 0" },
    { translate: "6px 0" },
    { translate: "-4px 0" },
    { translate: "2px 0" },
    { translate: "0 0" },
];

const MARK_BUILD_MS = 1950;
const MARK_HIDE_MS = 360;
const MARK_EVERY_MS = 6000;

function Brand() {
    const [drawn, setDrawn] = useState<boolean | undefined>(undefined);
    const still = usePrefersReducedMotion();

    useEffect(() => {
        if (still) return;
        const timers: number[] = [];
        const build = () => {
            setDrawn(false);
            timers.push(window.setTimeout(() => setDrawn(true), MARK_HIDE_MS));
            timers.push(window.setTimeout(() => setDrawn(undefined), MARK_HIDE_MS + MARK_BUILD_MS));
        };
        const every = window.setInterval(build, MARK_EVERY_MS);
        return () => {
            window.clearInterval(every);
            timers.forEach(window.clearTimeout);
            setDrawn(undefined);
        };
    }, [still]);

    return (
        <div className="auth-brand relative z-10 inline-flex items-center gap-3.5 rounded-2xl">
            <span className="relative inline-flex h-11 w-11 shrink-0 sm:h-12 sm:w-12">
                <span aria-hidden="true" className="nav-brand-glow pointer-events-none absolute -inset-[55%] rounded-full" />
                <HorizonMark className="relative h-full w-full" drawn={drawn} />
            </span>
            <BrandName className="text-[28px] sm:text-[32px]" />
        </div>
    );
}

function AuthCard({ view, shake, entrance, children }: { view: string; shake: number; entrance: Entrance; children: ReactNode }) {
    const rise = useRef<HTMLDivElement>(null);
    const body = useRef<HTMLDivElement>(null);
    const shownView = useRef<string | null>(null);

    useLayoutEffect(() => {
        if (entrance !== "soft" || !rise.current) return;
        return play([rise.current], SOFT_RISE, { duration: 800 });
    }, [entrance]);

    useLayoutEffect(() => {
        const previous = shownView.current;
        shownView.current = view;
        if (!body.current || (previous === null ? entrance !== "soft" : previous === view)) return;
        return play(body.current.querySelectorAll("[data-cascade]"), CONTENT_RISE, { delay: previous === null ? 180 : 0, step: 55, duration: 600 });
    }, [view, entrance]);

    useEffect(() => {
        if (!shake || !rise.current) return;
        return play([rise.current], SHAKE, { duration: 480, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" });
    }, [shake]);

    return (
        <div className="relative">
            <div ref={rise} className="relative z-10 will-change-transform">
                <div className="relative">
                    <div className="auth-panel relative z-10">
                        <div ref={body} key={view} className="relative p-6 sm:px-8 sm:pb-7 sm:pt-6">
                            {children}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function AuthScene({ title, entrance, view, shake, children }: {
    title: string;
    entrance: Entrance;
    view: string;
    shake: number;
    children: ReactNode;
}) {
    const clock = useIntro();
    const showcase = useRef<HTMLDivElement>(null);
    const side = useRef<HTMLDivElement>(null);
    useIntroEntrance(showcase, APPEAR, CARD, EASE_OUT);
    useIntroEntrance(side, APPEAR, CARD, EASE_OUT);

    return (
        <div
            onPointerDown={() => clock?.hurry()}
            className="auth-page relative min-h-screen overflow-clip bg-background"
        >
            <div aria-hidden="true" className="auth-sky pointer-events-none absolute inset-y-0 left-0 hidden overflow-hidden lg:block">
                <Nebula glints={false} strong className="!absolute" />
            </div>
            <div aria-hidden="true" className="auth-warm pointer-events-none absolute inset-y-0 right-0 w-full lg:w-1/2" />
            <div className="relative grid min-h-screen lg:grid-cols-2">
                <aside className="relative hidden flex-col items-center justify-center overflow-hidden px-[var(--gutter)] lg:flex">
                    <div ref={showcase} className="flex flex-col items-center">
                        <div className="relative scale-[1.35]">
                            <Brand />
                        </div>
                        <IdeaForge from={FORGE_FROM} className="mt-10" />
                    </div>
                    <GravityLens />
                </aside>
                <div className="relative flex min-h-screen items-center justify-center px-[var(--gutter)] py-10">
                    <div ref={side} className="relative w-full max-w-md">
                        <h1 className="sr-only">{title}</h1>
                        <div className="mb-8 flex justify-center lg:hidden">
                            <Brand />
                        </div>
                        <main className="relative w-full">
                            <AuthCard view={view} shake={shake} entrance={entrance}>
                                {children}
                            </AuthCard>
                        </main>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function AuthLayout({ title, view = "form", shake = 0, children }: { title: string; view?: string; shake?: number; children: ReactNode }) {
    const [first] = useState(() => !introOffered);
    const clock = useIntroClock(first);
    const [entrance] = useState<Entrance>(() => (clock ? "intro" : isSliding() ? "none" : "soft"));
    useEffect(() => {
        introOffered = true;
    }, []);

    return (
        <IntroContext.Provider value={clock}>
            <AuthScene title={title} entrance={entrance} view={view} shake={shake}>
                {children}
            </AuthScene>
        </IntroContext.Provider>
    );
}

