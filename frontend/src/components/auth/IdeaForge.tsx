/**
 * The sign-in pages' working demo, under the brand on the left-hand half: an idea is described, and it becomes real.
 *
 * Handles: one line of caption that says what is happening - "Describe an idea." while the idea is being typed,
 * "Watch it become real." from the moment it is sent, the new line rising in as the form's button labels do
 * (.auth-swap) - over one card made of the signed-in app's own material. The card's top row is the dashboard's
 * prompt in miniature (the spark badge, which warms while the idea is typed, the idea itself behind a gold caret, and
 * the send button, which lights once there is something to send and presses in). When the idea is sent the card
 * unrolls downwards and the app it asked for is built under the prompt: its tile and name, a chip that turns from
 * "Building" beside the app's comet to "Live" beside a gold dot, and the app's own parts rising in one after another.
 * Once it is live the app does one thing by itself, so that it reads as working rather than as a picture - then the
 * card rolls back up, the prompt empties and the next idea is typed. There are three (IDEAS), each with its own
 * small app: a habit tracker whose last day gets ticked and whose streak goes from twelve to thirteen, a trip budget
 * that takes one more expense and re-divides itself, and a reading list where a book is finished.
 *
 * Everything is driven by one clock (motion.ts's useStopwatch) cut into fixed-length ideas (IDEA_MS; the moments
 * within one are TYPE_FROM to CLEAR). The clock runs only while the card is on screen and, on a load that opens with
 * the intro sequence, only once the page has reached `from` - so the first idea starts when the visitor can see it.
 * The parts move by CSS transitions keyed on how far into the idea the clock is, so the clock's coarse ticks still
 * animate smoothly. The card stands in a slot as tall as it is when open, so nothing above or below it moves as it
 * unrolls. Under reduced motion it shows the first app, built, live and done, and holds still. It is decoration to a
 * screen reader, which is given the sentence instead.
 *
 * The owner asked for "something better instead of this, maybe some working animation" about the two-line tagline
 * that stood here ("Describe an idea. / Watch it become real.", whose letters bent away from the pointer); the
 * sentence is kept as the caption and the card under it does what the sentence says. An earlier IdeaForge stood beside
 * the form in a column of its own, in the landing page's glass - a prompt bar, a thread with a spark running down it
 * and a separate, larger app window - and was taken out when the owner asked for just the logo, the name and the
 * form; this one is a single small card in the app's material, with the words the owner chose kept over it.
 */
import { type CSSProperties, type ReactNode } from "react";
import { ArrowUp, Check, Flame, Sparkles } from "lucide-react";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { useIntroReached } from "@/components/landing/intro";
import { STILL, useInView, usePrefersReducedMotion, useStopwatch } from "@/components/landing/motion";
import { cn } from "@/lib/utils";

const IDEA_MS = 9200;
const TYPE_FROM = 500;
const TYPE_END = 2300;
const SEND = 2650;
const OPEN = 2800;
const BUILD = 3100;
const LIVE = 4900;
const WORK = 6000;
const CLEAR = 8300;
const STILL_AT = WORK + 800;

const ROW_H = 50;
const BODY_H = 162;
const RISE_DELAY_MS = 450;

const GOLD = "hsl(42 100% 66%)";
const PALE = "hsl(44 72% 86%)";
const ICE = "hsl(212 90% 72%)";

const IDEAS = [
    { prompt: "A habit tracker with daily streaks", name: "Streaks", tile: "linear-gradient(135deg, hsl(44 100% 72%), hsl(24 96% 54%))", scene: "habits" },
    { prompt: "A trip budget to split with friends", name: "Trip split", tile: "linear-gradient(135deg, hsl(212 90% 72%), hsl(228 60% 46%))", scene: "budget" },
    { prompt: "A reading list that tracks my progress", name: "Reading list", tile: "linear-gradient(135deg, hsl(42 80% 84%), hsl(34 70% 52%))", scene: "reading" },
] as const;

type Scene = (typeof IDEAS)[number]["scene"];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function Rise({ on, className, children }: { on: boolean; className?: string; children?: ReactNode }) {
    return (
        <div
            className={cn(
                "transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                on ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.97] opacity-0",
                className
            )}
        >
            {children}
        </div>
    );
}

function Tick({ on, className }: { on: boolean; className?: string }) {
    return (
        <span
            className={cn(
                "grid shrink-0 place-items-center rounded-full border transition-[background-color,border-color,color,scale] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                on ? "scale-100 border-transparent bg-primary text-primary-foreground" : "scale-90 border-white/20 bg-transparent text-transparent",
                className
            )}
        >
            <Check className="h-[62%] w-[62%]" strokeWidth={3} />
        </span>
    );
}

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

function Habits({ s }: { s: number }) {
    const on = (at: number) => s >= at && s < CLEAR;
    const done = on(WORK);
    const streak = done ? 13 : 12;

    return (
        <>
            <div className="flex items-center justify-between gap-4">
                <Rise on={on(BUILD + 250)} className="shrink-0">
                    <p className="flex items-end gap-1.5 font-display text-[34px] font-semibold leading-none tabular-nums text-foreground">
                        <span key={streak} className={cn("inline-block", done && "animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none")}>
                            {streak}
                        </span>
                        <Flame className="mb-0.5 h-[18px] w-[18px] text-primary" />
                    </p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">day streak</p>
                </Rise>
                <Rise on={on(BUILD + 450)} className="flex gap-2">
                    {DAYS.map((day, index) => (
                        <span key={index} className="flex flex-col items-center gap-1.5">
                            <span className="font-mono text-[9px] leading-none text-muted-foreground/80">{day}</span>
                            <Tick on={index < 6 ? on(BUILD + 700 + index * 90) : done} className="h-[19px] w-[19px]" />
                        </span>
                    ))}
                </Rise>
            </div>
            <Rise on={on(BUILD + 850)} className="mt-4 flex items-center gap-2.5">
                <Tick on={done} className="h-4 w-4" />
                <span className="text-[12.5px] text-foreground/85">Read 20 pages</span>
                <span className="ml-auto text-[11px] text-muted-foreground">{done ? "Done today" : "Today"}</span>
            </Rise>
        </>
    );
}

const SPLITS = [
    { name: "Maya", colour: GOLD },
    { name: "Jo", colour: PALE },
    { name: "You", colour: ICE },
];

function Budget({ s }: { s: number }) {
    const on = (at: number) => s >= at && s < CLEAR;
    const added = on(WORK);
    const total = Math.round(1240 * clamp01((s - BUILD - 250) / 900)) + Math.round(60 * clamp01((s - WORK) / 500));
    const each = Math.round(total / 3);

    return (
        <>
            <div className="flex items-start justify-between gap-3">
                <Rise on={on(BUILD + 250)}>
                    <p className="font-display text-[30px] font-semibold leading-none tabular-nums text-foreground">${total.toLocaleString("en-US")}</p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">Lisbon trip, split 3 ways</p>
                </Rise>
                <Rise on={added} className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-[hsl(44_100%_80%)]">
                    + $60 dinner
                </Rise>
            </div>
            <Rise on={on(BUILD + 550)} className="mt-3.5 flex h-1.5 gap-[3px]">
                {SPLITS.map(({ name, colour }, index) => (
                    <span
                        key={name}
                        className="h-full rounded-full transition-[flex-grow] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                        style={{ background: colour, flexGrow: on(BUILD + 750 + index * 140) ? 1 : 0 }}
                    />
                ))}
            </Rise>
            <Rise on={on(BUILD + 950)} className="mt-2.5 flex justify-between text-[11px] text-muted-foreground">
                {SPLITS.map(({ name, colour }) => (
                    <span key={name} className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: colour }} />
                        {name}
                        <span className="tabular-nums text-foreground/85">${each}</span>
                    </span>
                ))}
            </Rise>
        </>
    );
}

const BOOKS = [
    { title: "The Long Orbit", read: 82, cover: "linear-gradient(160deg, hsl(42 100% 70%), hsl(22 96% 52%))" },
    { title: "Quiet Machines", read: 41, cover: "linear-gradient(160deg, hsl(212 90% 74%), hsl(226 56% 44%))" },
    { title: "Salt and Stars", read: 64, cover: "linear-gradient(160deg, hsl(44 60% 88%), hsl(36 40% 56%))" },
];

function Reading({ s }: { s: number }) {
    const on = (at: number) => s >= at && s < CLEAR;
    const finished = on(WORK);

    return (
        <div className="space-y-3.5">
            {BOOKS.map(({ title, read, cover }, index) => {
                const closed = index === 0 && finished;
                return (
                    <Rise key={title} on={on(BUILD + 250 + index * 170)} className="flex items-center gap-3">
                        <span className="h-[18px] w-[13px] shrink-0 rounded-[3px] ring-1 ring-inset ring-white/15" style={{ background: cover }} />
                        <span className="w-[7.5rem] shrink-0 truncate text-[12.5px] text-foreground/85">{title}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                            <span
                                className="block h-full rounded-full bg-gradient-to-r from-[hsl(44_100%_80%)] to-[hsl(38_100%_62%)] transition-[width] duration-1000 ease-out"
                                style={{ width: on(BUILD + 600 + index * 170) ? `${closed ? 100 : read}%` : "0%" }}
                            />
                        </span>
                        <span className="grid w-8 shrink-0 justify-items-end text-[11px] tabular-nums text-muted-foreground">
                            {closed ? <Tick on className="h-4 w-4 animate-in zoom-in-50 duration-300 motion-reduce:animate-none" /> : `${read}%`}
                        </span>
                    </Rise>
                );
            })}
        </div>
    );
}

const SCENES: Record<Scene, typeof Habits> = { habits: Habits, budget: Budget, reading: Reading };

export function IdeaForge({ from, className }: { from: number; className?: string }) {
    const reduced = usePrefersReducedMotion();
    const [ref, visible] = useInView<HTMLDivElement>({ once: false, threshold: 0.2, rootMargin: "0px" });
    const arrived = useIntroReached(from);
    const t = useStopwatch(visible && arrived, reduced, IDEA_MS * IDEAS.length);
    const clock = t === STILL ? STILL_AT : t;
    const index = Math.floor(clock / IDEA_MS) % IDEAS.length;
    const s = clock % IDEA_MS;
    const idea = IDEAS[index];
    const Scene = SCENES[idea.scene];

    const typed = s < TYPE_FROM ? 0 : Math.min(idea.prompt.length, Math.ceil(((s - TYPE_FROM) / (TYPE_END - TYPE_FROM)) * idea.prompt.length));
    const typing = s >= TYPE_FROM && s < SEND;
    const armed = typed > 2 && s < SEND + 240;
    const pressed = s >= SEND && s < SEND + 220;
    const open = s >= OPEN && s < CLEAR;
    const live = s >= LIVE && s < CLEAR;
    const real = s >= SEND && s < CLEAR + 450;
    const cleared = s >= CLEAR;

    return (
        <div
            ref={ref}
            style={{ "--rise-delay": `${RISE_DELAY_MS}ms` } as CSSProperties}
            className={cn("app-rise relative w-full max-w-[26rem] select-none", className)}
        >
            <p className="sr-only">Describe an idea. Watch it become real.</p>
            <p aria-hidden="true" className="flex h-8 items-end justify-center text-[17px] leading-7 text-muted-foreground">
                <span key={real ? "real" : "describe"} data-swap={t === STILL ? undefined : true} className="auth-swap whitespace-nowrap">
                    {real ? (
                        <>
                            Watch it become{" "}
                            <em className="heat-text animate-heat-sweep pr-0.5 font-display text-[1.2em] font-medium motion-reduce:animate-none">real.</em>
                        </>
                    ) : (
                        "Describe an idea."
                    )}
                </span>
            </p>

            <div aria-hidden="true" className="mt-4" style={{ height: ROW_H + BODY_H }}>
                <div
                    className="overflow-hidden rounded-[20px] border border-[hsl(36_24%_86%/0.18)] bg-[hsl(30_9%_6%/0.84)] shadow-[0_30px_70px_-36px_rgb(0_0_0/0.95)] backdrop-blur-md transition-[height] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                    style={{ height: open ? ROW_H + BODY_H : ROW_H }}
                >
                    <div className="flex items-center gap-2.5 pl-2.5 pr-2" style={{ height: ROW_H - 2 }}>
                        <span
                            className={cn(
                                "grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors duration-500",
                                typing ? "bg-primary/[0.14] text-[hsl(42_80%_68%)]" : "bg-white/[0.08] text-white/70"
                            )}
                        >
                            <Sparkles className="h-3.5 w-3.5" />
                        </span>
                        <span
                            className={cn(
                                "min-w-0 flex-1 truncate text-left text-[14px] tracking-[-0.005em] transition-[opacity,color] duration-300",
                                cleared ? "opacity-0" : "opacity-100",
                                open ? "text-white/60" : "text-white/90"
                            )}
                        >
                            {idea.prompt.slice(0, typed) || <span className="text-white/45">Ask Singularity to build…</span>}
                            {typing && <span className="ml-px inline-block h-[1.05em] w-[1.5px] translate-y-[0.18em] animate-cursor-blink bg-primary" />}
                        </span>
                        <span
                            className={cn(
                                "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border transition-[transform,color,border-color,background-color,box-shadow] duration-300",
                                armed
                                    ? "border-[hsl(42_70%_80%/0.3)] bg-[radial-gradient(130%_95%_at_50%_122%,hsl(40_100%_60%/0.42),hsl(30_100%_52%/0.12)_46%,transparent_66%),linear-gradient(180deg,hsl(34_14%_17%),hsl(30_12%_10%))] text-[hsl(44_72%_93%)] shadow-[0_8px_18px_-10px_hsl(36_100%_50%/0.6)]"
                                    : "border-white/[0.07] bg-white/[0.04] text-muted-foreground/80",
                                pressed && "scale-90"
                            )}
                        >
                            <ArrowUp className="h-3.5 w-3.5" />
                        </span>
                    </div>

                    <div className="border-t border-white/[0.07] px-4 pb-3.5 pt-3" style={{ height: BODY_H }}>
                        <Rise on={s >= BUILD && s < CLEAR} className="flex items-center gap-2.5">
                            <span className="h-[22px] w-[22px] shrink-0 rounded-[7px] ring-1 ring-inset ring-white/15" style={{ background: idea.tile }} />
                            <span className="text-[12.5px] font-semibold tracking-[-0.01em] text-foreground/90">{idea.name}</span>
                            <span
                                className={cn(
                                    "ml-auto flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition-colors duration-500",
                                    live ? "border-primary/30 text-[hsl(44_100%_80%)]" : "border-white/[0.09] text-muted-foreground"
                                )}
                            >
                                {live || cleared ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : <OrbitSpinner className="h-3 w-3" />}
                                {live || cleared ? "Live" : "Building"}
                            </span>
                        </Rise>
                        <div className="mt-3.5 flex h-[99px] flex-col justify-center">
                            <Scene key={index} s={s} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
