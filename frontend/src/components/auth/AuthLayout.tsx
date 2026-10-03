/**
 * The stage every sign-in page is set on.
 *
 * Handles: the landing page's sky (LandingBackdrop) behind everything, with the dashboard's wash of colour rising from the
 * foot of the left-hand (brand) half only (Nebula without its stars, which the sky already has - the owner asked for the gas nebula here first, and then for
 * the wash that replaced it on the signed-in pages - held inside that half
 * rather than fixed to the window, at the owner's request) and, now and then, a shooting star across that half's
 * upper sky - a faint gold streak, one every seven and a half seconds, each of three taking its own path on a 22.5-second
 * cycle (.shooting-star), kept to the top of that sky, well clear of the brand - and a way back to the landing page in the top-right corner,
 * leaving by the page slide - its words written in stardust (.stardust-text, a gold-to-cream gradient with a soft glow
 * whose light slides across on hover, and four tiny motes rising off and fading in a slow loop, .stardust-link-mote,
 * the same motes the form's fields shed as someone types), with a gold underline wiping in under the pointer (.wipe-link);
 * in that half the horizon mark (HorizonMark) with the name beside it, leading home (Brand). The name never animates,
 * and the mark does on a clock alone: every six seconds it hides and replays its build, then holds still until the
 * next - the pointer does nothing to it, and the glow behind it (.auth-brand) never moves. Before this the owner had
 * it replay only under the pointer, with the glow breathing while hovered, and then asked for the clock instead;
 * before that it built itself as the page opened and kept breathing after, with the name wiping in beside it. Under
 * the brand, the working demo (IdeaForge.tsx): one line of caption over a small card in which an idea is typed into
 * the app's prompt and the app it asks for is built and goes live, three ideas on a loop, starting once the page's
 * opening has got as far as FORGE_FROM. It stands where the tagline was - "Describe an idea. Watch it become real.",
 * two lines whose letters bent away from the pointer (a gold star flying from "idea." to "real project." every twelve
 * seconds was tried before that and turned down; one plain muted sentence before that) - which the owner asked to be
 * replaced by "something better ... maybe some working animation"; the sentence is now the demo's caption, each half
 * of it shown while the card does what it says. The brand stands higher than it did, to make room, and the shooting
 * stars' paths were moved up with it so that none crosses the name. Over the whole half, on top of everything in it,
 * rides the pointer's lens (GravityLens.tsx): a faint disc of glass that follows the pointer and, where the browser
 * can do it (Chromium), optically bends whatever is behind it - nebula, shooting star, mark, name, demo. In the other
 * half, the card the form sits on. That is all there is: the stage used to carry a two-line headline and an earlier,
 * larger IdeaForge in a column of their own beside the card, and the owner asked for just the logo, the name and the
 * form (the link home went with them and was asked back). The page's name is still given to screen readers as a
 * hidden heading (title). The form stands straight on the night with no box round it (.auth-panel keeps only its
 * rounding and the faint light of the eclipse that heads each form falling on its head), with the dashboard's gold
 * bloom breathing behind it (.app-bloom): the owner had the card's hairline, its dark grey fill and its shadow taken
 * away. It was a card in the dashboard's flat dark grey before that, the landing page's recommended plan card before
 * that (the rippling grid, lit cells and stars of PlanLight, lit from its bottom edge), and frosted glass in a violet
 * bloom before that. A refused attempt (shake) shakes the card, and a change of view
 * (the form, the second factor, the inbox check) brings its rows up in turn. The page is laid out to fit a laptop
 * screen without scrolling; when the card grows (the sign-up form's name field) the mark and the card stay centred
 * together. What goes inside the card - the eclipse, the headline, the fields and the buttons - is AuthForm.tsx's.
 *
 * The first sign-in page of a visit opens with a sequence on the landing page's clock (landing/intro.ts): the card
 * eases up into its bloom as the sky fades up, and the form's rows (each marked data-cascade) rise in
 * turn. Only the first page gets it - moving between sign-in pages shouldn't replay it - and arriving by the page
 * slide gets none, since the page comes in already made; a later sign-in page reached any other way rises in softly
 * instead. A click anywhere hurries the sequence to its end, as a key press or a scroll already does, and a view that
 * changes mid-sequence finishes the sequence's own animations on those pieces before running its own, so the two
 * never fight over them. The root carries .auth-page, which is how the page slide knows the sign-in page has rendered
 * and may slide in, and data-intro, which holds the landing sky's sheens back until the page is made.
 *
 * Under reduced motion nothing drops, rises,
 * shakes, draws or loops; the page is simply there.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandName, HorizonMark } from "@/components/HorizonMark";
import { SlideLink } from "@/components/SlideLink";
import { LandingBackdrop } from "@/components/landing/LandingBackdrop";
import { Nebula } from "@/components/app/Nebula";
import { StardustMotes } from "@/components/auth/AuthForm";
import { GravityLens } from "@/components/auth/GravityLens";
import { IdeaForge } from "@/components/auth/IdeaForge";
import {
    CARD_RISE,
    CONTENT_RISE,
    EASE_OUT,
    FADE_IN,
    INTRO,
    IntroContext,
    ITEM_DROP,
    useIntro,
    useIntroChildrenEntrance,
    useIntroClock,
    useIntroEntrance,
    useIntroReached,
    useIntroStagger,
} from "@/components/landing/intro";
import { play, usePrefersReducedMotion } from "@/components/landing/motion";
import { isSliding } from "@/lib/page-slide";

type Entrance = "intro" | "soft" | "none";

let introOffered = false;

const BLOOM = { at: 300, for: 1300 };
const CARD = { at: 380, for: 1100 };
const CARD_FADE = { at: 380, for: 600 };
const ROWS = { at: 820, for: 600 };
const BACK = { at: 1000, for: 600 };
const FORGE_FROM = 1100;
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

function BackHome() {
    const link = useRef<HTMLAnchorElement>(null);
    useIntroEntrance(link, ITEM_DROP, BACK);

    return (
        <SlideLink
            ref={link}
            to="/"
            className="wipe-link group absolute right-[var(--gutter)] top-6 z-30 flex items-center gap-1.5 text-[13.5px] font-medium text-primary hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-x-0.5" />
            <span className="stardust-text">Back to home</span>
            <StardustMotes />
        </SlideLink>
    );
}

const SHOOTING_STARS = [
    { top: "10%", left: "18%", angle: "18deg", delay: "3s" },
    { top: "7%", left: "70%", angle: "158deg", delay: "10.5s" },
    { top: "6%", left: "30%", angle: "20deg", delay: "18s" },
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
        <SlideLink
            to="/"
            aria-label="Singularity home"
            className="auth-brand relative z-10 inline-flex items-center gap-3.5 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        >
            <span className="relative inline-flex h-11 w-11 shrink-0 sm:h-12 sm:w-12">
                <span aria-hidden="true" className="nav-brand-glow pointer-events-none absolute -inset-[55%] rounded-full" />
                <HorizonMark className="relative h-full w-full" drawn={drawn} />
            </span>
            <BrandName className="text-[28px] sm:text-[32px]" />
        </SlideLink>
    );
}

function AuthCard({ view, shake, entrance, children }: { view: string; shake: number; entrance: Entrance; children: ReactNode }) {
    const bloom = useRef<HTMLDivElement>(null);
    const rise = useRef<HTMLDivElement>(null);
    const layers = useRef<HTMLDivElement>(null);
    const body = useRef<HTMLDivElement>(null);
    const shownView = useRef<string | null>(null);
    useIntroEntrance(bloom, FADE_IN, BLOOM, "cubic-bezier(0.4, 0, 0.2, 1)");
    useIntroEntrance(rise, CARD_RISE, CARD, EASE_OUT);
    useIntroChildrenEntrance(layers, FADE_IN, CARD_FADE);
    useIntroStagger(body, "[data-cascade]", CONTENT_RISE, ROWS, 60);

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
            <div ref={bloom} aria-hidden="true" className="pointer-events-none absolute -inset-x-24 -inset-y-20">
                <div className="app-bloom h-full w-full" />
            </div>
            <div ref={rise} className="relative z-10 will-change-transform">
                <div ref={layers} className="relative">
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
    const live = useIntroReached(INTRO.live);

    return (
        <div
            data-intro={live ? "live" : "playing"}
            onPointerDown={() => clock?.hurry()}
            className="auth-page relative min-h-screen overflow-x-clip bg-background"
        >
            <LandingBackdrop />
            <BackHome />
            <div className="relative grid min-h-screen lg:grid-cols-2">
                <aside className="relative hidden flex-col items-center justify-center overflow-hidden px-[var(--gutter)] lg:flex">
                    <Nebula stars={false} className="sky-strong absolute" />
                    {SHOOTING_STARS.map(({ top, left, angle, delay }) => (
                        <span
                            key={delay}
                            aria-hidden="true"
                            className="shooting-star"
                            style={{ top, left, "--angle": angle, "--delay": delay } as CSSProperties}
                        />
                    ))}
                    <span aria-hidden="true" className="plan-halo pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60" />
                    <div className="relative scale-[1.35]">
                        <Brand />
                    </div>
                    <IdeaForge from={FORGE_FROM} className="mt-10" />
                    <GravityLens />
                </aside>
                <div className="relative flex min-h-screen items-center justify-center bg-background/70 px-[var(--gutter)] py-10 backdrop-blur-none lg:border-l lg:border-white/[0.06]">
                    <div className="w-full max-w-md">
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

