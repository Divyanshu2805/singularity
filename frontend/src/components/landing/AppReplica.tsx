/**
 * The app's own screens rebuilt as still pieces a script can drive, and the camera that films them: what every
 * window on the landing page - the hero's card, the build orbit's scenes and the feature demos - is made of.
 *
 * Handles: the screen (Screen), a view onto a canvas laid out at the app's real size, which shows the whole screen
 * and moves in on the part the script names (an element marked data-shot) only when it has to - see the camera's
 * rule below - and moves a pointer to
 * whichever control the script names (data-cur), pressing it with a ripple; the workspace's parts - the sidebar, the
 * project header with its Preview/Code switch, the chat window with its turns (the person's bubble, the "Worked for"
 * line, the files read, the build steps, the edited files, the answer), the prompt with its mode chip and send
 * button, the usage line above it, the file tree, the editor with its tabs, line numbers and syntax colours, the
 * preview window with its toolbar and its idle, starting and running states, and the ExplainLLM panel; the
 * dashboard's parts - the headline, the prompt, the idea chips and the idea interview's card; the running-club app
 * the demos build, which grows a chart, a dark theme and cheers as it is asked for them. The timing helpers the
 * scripts are written with, and the data both share, live beside it in replica.ts.
 *
 * Nothing here is a look-alike: each piece is written with the classes the real component uses (index.css's
 * .ws-window, .ws-bar, .chat-tile, .app-prompt, .app-send, .seg-pill, .row-active and the rest), inside a wrapper
 * that carries .dash-night and .ws-shell so those rules apply as they do in the app, and it borrows the app's own
 * mark, spinner, file icons and project gradients. A change to the app's styling therefore shows up on the landing
 * page with no second copy to keep in step. The pieces take what to show as props and hold no state, so a scene is a
 * pure function of its clock and can be paused, rewound by the scroll or pinned to its last frame.
 *
 * The camera's rule: stay wide, and go in only when the view is too small to make things out. The canvas is the
 * view divided by a base scale, so the whole screen fits the view exactly; every limit below is the size things
 * come out at on screen (app scale times whatever an ancestor does to the view - a card's transform, the orbit's CSS
 * zoom), not a multiple of the base, so a film behaves the same wherever it is shown. With a shot named, the camera
 * goes in on it only (a) up to READ, when the whole screen is drawn smaller than that - a phone - or (b) up to LOOK,
 * and only as far as the window the shot sits in (FRAME, or the shot itself outside any window) still fits whole,
 * so a compact block such as the interview's card is brought closer for free and an editor or a chat is never cut
 * to do it. While the pointer is on a control that would be drawn under SMALL_PX tall, it goes in to PRESS, centred
 * on that control, and comes back out when the pointer leaves. A move of under SETTLE is not made at all. When the
 * window fits, the view is held so all of it stays in, and a control under the pointer is always kept inside the
 * view with a margin.
 *
 * Before this the camera fitted each named shot to the view up to a zoom the caller allowed (2.2 to 2.6 times the
 * base), and the films spent most of their time that close: code ran off the editor's edge, menus lost their items
 * and a chat showed half a window. The owner asked for it to zoom only when and where the view is too small to
 * see, above all when a small button is clicked - so on a wide card (the hero's, and How it works on a desktop) the
 * camera now does not move at all, and the zoom and reach settings the callers passed are gone.
 *
 * The screen is drawn at its base size by CSS zoom, not by a transform: the canvas (the camera's layer, the size of
 * the view) holds a sheet laid out at the app's size and zoomed down to fit, and only the camera's extra move is a
 * transform on the canvas. Scaling the whole thing by transform drew the app at full size and resampled the picture,
 * and wherever a part of it sat on a layer of its own (a window that had just risen in, a card tilting in 3D) that
 * part was resampled from the wrong size - the films' type came out soft, which the owner asked to have fixed. With
 * zoom the type is laid out and drawn at the size it is shown. A browser will not draw type under its minimum size,
 * so the sheet is never zoomed below ZOOM_FLOOR of the app's size on screen (counting any zoom round the view); on a
 * view smaller than that - a phone - the rest of the reduction is the canvas's transform.
 *
 * The editor wraps a line that is longer than its window, as the app's own editor does, rather than clipping it at
 * the window's edge; its scroll position is measured from the lines themselves, since a wrapped line is taller than
 * one row, and while a file is streaming in it keeps the last line in view. Its unselected tabs give way so the
 * selected one is never pushed under the toolbar. The scripts keep their sample code short enough that a line rarely
 * needs to wrap, and the workspace gives the chat about a third of the width (split) so the editor has the rest.
 *
 * It never measures a layout by hand: a named part is found in the canvas and read as a share of the sheet's own
 * box, which keeps working where an ancestor is enlarged with CSS zoom and getBoundingClientRect and offsetWidth no
 * longer speak the same units. The move itself is one CSS transition on the canvas's transform, so it costs nothing per frame and a
 * script whose clock ticks every 80ms still pans smoothly. The pointer lives on the canvas and is held at one size
 * on screen by undoing the camera's scale (--cam). The canvas is inert and hidden from assistive technology: every
 * window says what it shows in the text beside it.
 *
 * Reading a part as a share of the sheet's box holds only while the screen is drawn flat or evenly scaled. A page
 * may stand the screen in perspective (the landing rebuild's hero tilts the project window in 3D), and there a
 * share of the projected box is no longer a share of the sheet: half-way across the window the pointer landed some
 * ten to fifteen pixels short of the control it was sent to. So an ancestor that tilts the screen marks itself
 * data-tilt, and its transform is taken off for the length of the measurement and put straight back, inside the one
 * layout effect, before anything is painted. The ancestor must not carry a CSS transition on its transform, or
 * putting it back would animate.
 *
 * New content in a chat grows into place (index.css, .replica-grow) rather than appearing, so the transcript
 * scrolls up under it the way the real one does while a turn streams; the editor and the built app scroll by a
 * transform on their content, eased, when the script moves their top line.
 */
import { forwardRef, memo, useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Circle,
  ClipboardCopy,
  Clock,
  CodeXml,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileDown,
  FilePen,
  FileSearch,
  Flame,
  FolderOpen,
  Gauge,
  GitFork,
  GraduationCap,
  Hammer,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  ListChecks,
  MessagesSquare,
  PanelLeftClose,
  PenLine,
  Pin,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Smartphone,
  Sparkles,
  Square,
  SquareTerminal,
  Star,
  Trash2,
  User,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { BrandName, HorizonMark } from "@/components/HorizonMark";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { HeadlineWords } from "./HeadlineWords";
import { getFileColor, getFileIcon, splitPath } from "@/lib/file-icons";
import { PREVIEW_STEPS } from "@/lib/preview";
import { cn, generateGradient } from "@/lib/utils";
import { LINE_H, PEOPLE, ease, span, type CodeLine } from "./replica";

export interface ScreenProps {
  shot?: string | null;
  cursor?: string | null;
  press?: boolean;
  base?: number | ((width: number) => number);
  pad?: number;
  glide?: number;
  className?: string;
  children: ReactNode;
}

const READ = 0.5;
const LOOK = 0.72;
const PRESS = 0.75;
const SMALL_PX = 18;
const MARGIN_PX = 28;
const SETTLE = 1.06;
const ZOOM_FLOOR = 0.5;
const FRAME = ".ws-window";

type Box = { x: number; y: number; w: number; h: number };

const keep = (value: number, low: number, high: number) => (low > high ? value : Math.min(high, Math.max(low, value)));

export const Screen = forwardRef<HTMLDivElement, ScreenProps>(function Screen(
  { shot = null, cursor = null, press = false, base = 0.5, pad = 14, glide = 1100, className, children },
  outer
) {
  const view = useRef<HTMLDivElement | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pointer = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  const [size, setSize] = useState({ w: 0, h: 0, zoom: 1 });

  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      view.current = node;
      if (typeof outer === "function") outer(node);
      else if (outer) outer.current = node;
    },
    [outer]
  );

  useLayoutEffect(() => {
    const node = view.current;
    if (!node) return;
    const measure = () => {
      const next = { w: node.clientWidth, h: node.clientHeight, zoom: (node as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom || 1 };
      setSize((current) => (current.w === next.w && current.h === next.h && current.zoom === next.zoom ? current : next));
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, []);

  const k = size.w ? (typeof base === "function" ? base(size.w) : base) : 1;
  const drawn = Math.max(k, ZOOM_FLOOR / size.zoom);

  useLayoutEffect(() => {
    const canvas = stage.current;
    const frameOf = view.current;
    if (!canvas || !frameOf || !size.w || !size.h) return;
    const cw = size.w / k;
    const ch = size.h / k;
    const sheet = canvas.firstElementChild as HTMLElement | null;
    if (!sheet) return;
    const tilted = frameOf.closest<HTMLElement>("[data-tilt]");
    const tilt = tilted?.style.transform ?? "";
    if (tilted) tilted.style.transform = "none";
    const box = canvas.getBoundingClientRect();
    const now = sheet.getBoundingClientRect().width / cw || 1;
    const shown = frameOf.getBoundingClientRect().width / size.w || 1;
    const find = (kind: string, name: string | null) => (name ? canvas.querySelector<HTMLElement>(`[data-${kind}~="${name}"]`) : null);
    const rectOf = (element: HTMLElement): Box => {
      const rect = element.getBoundingClientRect();
      return { x: (rect.left - box.left) / now, y: (rect.top - box.top) / now, w: rect.width / now, h: rect.height / now };
    };
    const fit = (rect: Box) => Math.min((size.w - 2 * pad) / rect.w, (size.h - 2 * pad) / rect.h);

    const target = find("shot", shot);
    const aim = find("cur", cursor);
    const subject = target ? rectOf(target) : null;
    const whole = target ? rectOf(target.closest<HTMLElement>(FRAME) ?? target) : null;
    const control = aim ? rectOf(aim) : null;
    if (tilted) tilted.style.transform = tilt;

    let scale = subject || control ? Math.max(k, READ / shown) : k;
    if (whole) scale = Math.max(scale, Math.min(LOOK / shown, fit(whole)));
    const small = control !== null && control.h * scale * shown < SMALL_PX;
    if (small) scale = Math.max(scale, PRESS / shown);
    if (scale < k * SETTLE) scale = k;

    let cx = cw / 2;
    let cy = ch / 2;
    if (scale > k) {
      const halfW = size.w / scale / 2;
      const halfH = size.h / scale / 2;
      const lead = small ? control : (subject ?? control);
      if (lead) {
        cx = lead.x + lead.w / 2;
        cy = lead.y + lead.h / 2;
      }
      if (whole && !small) {
        const edge = pad / scale;
        cx = keep(cx, whole.x + whole.w - halfW + edge, whole.x + halfW - edge);
        cy = keep(cy, whole.y + whole.h - halfH + edge, whole.y + halfH - edge);
      }
      if (control) {
        const edge = MARGIN_PX / (scale * shown);
        cx = keep(cx, control.x + control.w - halfW + edge, control.x + halfW - edge);
        cy = keep(cy, control.y + control.h - halfH + edge, control.y + halfH - edge);
      }
    }
    const x = Math.min(0, Math.max(size.w - cw * scale, size.w / 2 - cx * scale));
    const y = Math.min(0, Math.max(size.h - ch * scale, size.h / 2 - cy * scale));
    canvas.style.transitionDuration = placed.current ? `${glide}ms` : "0ms";
    canvas.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${(scale / drawn).toFixed(4)})`;
    canvas.style.setProperty("--cam", scale.toFixed(4));
    placed.current = true;

    const dot = pointer.current;
    if (!dot) return;
    if (control) {
      dot.style.left = `${(control.x + control.w * 0.5).toFixed(1)}px`;
      dot.style.top = `${(control.y + control.h * 0.55).toFixed(1)}px`;
    }
    dot.dataset.on = control ? "true" : "false";
  }, [shot, cursor, size.w, size.h, k, drawn, pad, glide]);

  return (
    <div ref={attach} className={cn("dash-night ws-shell replica relative overflow-hidden", className)}>
      <div
        ref={stage}
        aria-hidden="true"
        className="replica-canvas"
        style={{ width: size.w || "100%", height: size.h || "100%" }}
        {...{ inert: "" }}
      >
        <div className="relative" style={{ width: size.w ? size.w / k : "100%", height: size.h ? size.h / k : "100%", zoom: drawn, containerType: "inline-size" }}>
          {children}
          <span ref={pointer} data-on="false" data-down={press} className="replica-cursor">
            {press && <span className="demo-ripple absolute -left-3 -top-3 h-6 w-6 rounded-full border border-primary/80" />}
            <svg viewBox="0 0 16 20" className="h-[19px] w-[15px]">
              <path d="M1 1 L1 16 L5 12 L8 19 L10.5 18 L7.5 11 L13 11 Z" fill="hsl(40 40% 97.9%)" stroke="hsl(30 11% 7%)" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
});

export function Grow({ children, className, gap = true }: { children: ReactNode; className?: string; gap?: boolean }) {
  return (
    <div className="replica-grow">
      <div className={cn("min-h-0", gap && "pt-5", className)}>{children}</div>
    </div>
  );
}

export function Caret() {
  return <span className="replica-caret" />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="sidebar-kbd inline-flex h-[18px] items-center px-1 font-sans text-[10px] font-medium leading-none text-foreground/80">{children}</kbd>;
}

export function Swatch({ name, className }: { name: string; className?: string }) {
  return <span className={cn("shrink-0 rounded ring-1 ring-inset ring-white/10", className)} style={generateGradient(name)} />;
}

function IconButton({ children, cur, press, className }: { children: ReactNode; cur?: string; press?: boolean; className?: string }) {
  return (
    <span data-cur={cur} data-press={press || undefined} className={cn("icon-btn h-8 w-8 [&_svg]:size-4", className)}>
      {children}
    </span>
  );
}

const SIDE_PROJECTS = [
  { group: "Pinned", icon: Pin, names: ["running-club"] },
  { group: "Starred", icon: Star, names: ["recipe-box"] },
  { group: "Recent", icon: null, names: ["study-planner", "tip-splitter", "photo-portfolio"] },
] as const;

function SideRow({ icon: Icon, label, active, trailing, swatch }: { icon?: LucideIcon; label: string; active?: boolean; trailing?: ReactNode; swatch?: boolean }) {
  return (
    <div className={cn("sidebar-row relative flex h-8 items-center gap-3 whitespace-nowrap rounded-lg px-3 text-[13.5px]", active ? "row-active font-medium" : "text-foreground/70")}>
      {swatch ? <Swatch name={label} className="h-4 w-4" /> : Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </div>
  );
}

export const Sidebar = memo(function Sidebar({ current = "running-club", busy = false }: { current?: string | null; busy?: boolean }) {
  return (
    <aside data-cascade className="app-sidebar app-sidebar-inset flex w-64 shrink-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center">
          <HorizonMark className="h-7 w-7" />
        </span>
        <BrandName className="text-[19px]" />
        <span className="ml-auto flex h-8 w-8 items-center justify-center text-muted-foreground">
          <PanelLeftClose className="h-4 w-4" />
        </span>
      </div>
      <div className="space-y-0.5 px-3 pt-1">
        <div className="sidebar-new-row relative mb-1 flex h-10 items-center gap-2.5 overflow-hidden rounded-[0.625rem] pl-1.5 pr-3">
          <span className="sidebar-new-plus relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
            <Plus className="h-4 w-4" />
          </span>
          <span className="text-[13.5px] font-medium">New project</span>
        </div>
        <SideRow icon={Search} label="Search" trailing={<kbd className="sidebar-kbd px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Ctrl K</kbd>} />
        <SideRow icon={LayoutDashboard} label="Dashboard" active={current === null} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-2">
        <p className="sidebar-label px-3 pb-1.5 pt-5">Projects</p>
        <div className="space-y-0.5">
          <SideRow icon={LayoutGrid} label="All projects" />
          <SideRow icon={User} label="Owned by me" />
          <SideRow icon={Users} label="Shared with me" />
        </div>
        {SIDE_PROJECTS.map(({ group, icon: Icon, names }) => (
          <div key={group}>
            <p className="sidebar-label flex items-center gap-1.5 px-3 pb-1.5 pt-5">
              {Icon && <Icon className="h-3 w-3" />}
              {group}
            </p>
            <div className="space-y-0.5">
              {names.map((name) => (
                <SideRow key={name} swatch label={name} active={name === current} trailing={name === current && busy ? <OrbitSpinner className="h-3.5 w-3.5" /> : undefined} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.07] p-3">
        <div className="flex h-11 items-center gap-2.5 px-1">
          <span className="avatar-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-primary-foreground">A</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium">Asha Rao</span>
            <span className="block truncate text-xs text-muted-foreground">asha@runclub.dev</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </div>
      </div>
    </aside>
  );
});

export type ViewMode = "preview" | "code";

const VIEWS: { mode: ViewMode; label: string; Icon: LucideIcon }[] = [
  { mode: "preview", label: "Preview", Icon: Eye },
  { mode: "code", label: "Code", Icon: CodeXml },
];

export function ViewSwitch({ mode, live = false }: { mode: ViewMode; live?: boolean }) {
  return (
    <div data-shot="switch" className="app-track relative grid grid-cols-2 p-0.5">
      <span
        className={cn(
          "seg-pill absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] transition-transform duration-[650ms] ease-[cubic-bezier(0.34,1.35,0.64,1)] motion-reduce:transition-none",
          mode === "code" && "translate-x-full"
        )}
      />
      {VIEWS.map(({ mode: view, label, Icon }) => (
        <span
          key={view}
          data-cur={`tab-${view}`}
          className={cn("relative z-10 flex h-7 items-center justify-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-colors duration-300", mode === view ? "text-foreground" : "text-muted-foreground")}
        >
          <Icon className={cn("h-3.5 w-3.5 transition-colors", mode === view && "text-primary")} />
          {label}
          {view === "preview" && live && <span className="h-1.5 w-1.5 rounded-full bg-syntax-string" />}
        </span>
      ))}
    </div>
  );
}

export function Avatar({ person, className }: { person: { name: string; email: string }; className?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)} style={generateGradient(person.email)}>
      {person.name.charAt(0)}
    </span>
  );
}

export const WorkHeader = memo(function WorkHeader({ mode, live = false, name = "running-club", people = 3, pressed, downloading = false }: {
  mode: ViewMode;
  live?: boolean;
  name?: string;
  people?: number;
  pressed?: string | null;
  downloading?: boolean;
}) {
  return (
    <header data-cascade className="relative z-10 grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-2">
      <div data-shot="name" className="flex min-w-0 items-center gap-1 pl-1">
        <Swatch key={name} name={name} className="chat-enter h-5 w-5" />
        <span key={`${name}-label`} className="chat-enter min-w-0 truncate px-1.5 py-1 text-sm font-medium">
          {name}
        </span>
        <span className="ml-1 flex shrink-0 items-center">
          <IconButton>
            <Pin className="pin-active" />
          </IconButton>
          <IconButton>
            <Star />
          </IconButton>
        </span>
      </div>
      <ViewSwitch mode={mode} live={live} />
      <div data-shot="actions" className="flex min-w-0 items-center justify-end gap-1">
        <IconButton>
          <ClipboardCopy />
        </IconButton>
        <IconButton>
          <FileDown />
        </IconButton>
        <IconButton cur="fork" press={pressed === "fork"}>
          <GitFork />
        </IconButton>
        <IconButton cur="download" press={pressed === "download"}>
          {downloading ? <OrbitSpinner /> : <Download />}
        </IconButton>
        <IconButton>
          <Trash2 />
        </IconButton>
        <span className="mx-1 h-5 w-px bg-white/[0.1]" />
        <span data-cur="share" data-press={pressed === "share" || undefined} className="btn btn-glass flex h-8 items-center gap-2 rounded-full border pl-1.5 pr-3 text-xs font-medium">
          <span className="flex -space-x-1.5">
            {PEOPLE.slice(0, people).map((person) => (
              <Avatar key={person.email} person={person} className="h-5 w-5 border-2 border-[hsl(30_11%_8%)] text-[9px]" />
            ))}
          </span>
          Share
        </span>
      </div>
    </header>
  );
});

export function Bubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="chat-user-bubble max-w-[85%] rounded-2xl rounded-br-md border px-3.5 py-2 text-[14px] leading-6 text-white">{children}</div>
    </div>
  );
}

export function TurnHead({ thought }: { thought?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <HorizonMark className="h-5 w-5" />
      {thought && (
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {thought}
        </span>
      )}
    </div>
  );
}

export function Working({ label = "Thinking" }: { label?: string }) {
  return (
    <div className="flex h-6 items-center gap-2 text-xs">
      <OrbitSpinner className="h-3.5 w-3.5" />
      <span className="text-shimmer font-medium">{label}&hellip;</span>
    </div>
  );
}

export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[14px] leading-6 text-foreground/90", className)}>{children}</p>;
}

export function FileChip({ path }: { path: string }) {
  const Icon = getFileIcon(path);
  return (
    <span className="inline-flex h-6 max-w-[220px] items-center gap-1.5 rounded-full border border-white/[0.12] bg-[hsl(var(--ws-card))] px-2 text-[11.5px] text-foreground/90">
      <Icon className={cn("h-3 w-3 shrink-0", getFileColor(path))} />
      <span className="truncate">{splitPath(path).base}</span>
    </span>
  );
}

export function ReadRow({ files, active = false }: { files: string[]; active?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <span className="flex h-6 shrink-0 items-center gap-1.5">
        {active ? <OrbitSpinner className="h-3.5 w-3.5" /> : <FileSearch className="h-3.5 w-3.5" />}
        {active ? "Reading" : "Read"}
      </span>
      <div className="flex min-w-0 flex-wrap gap-1">
        {files.map((file) => (
          <FileChip key={file} path={file} />
        ))}
      </div>
    </div>
  );
}

export type StepState = "done" | "active" | "pending";

function StepMark({ state }: { state: StepState }) {
  if (state === "done") return <Check className="h-3.5 w-3.5 shrink-0 text-syntax-string" />;
  if (state === "active") return <OrbitSpinner className="h-3.5 w-3.5" />;
  return <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />;
}

export function StepsTile({ steps, lesson }: { steps: { label: string; path: string; state: StepState }[]; lesson?: { index: number; open: boolean; concept: string; text: string; code?: string; line?: number } }) {
  const done = steps.filter((step) => step.state === "done").length;
  const running = steps.some((step) => step.state === "active");
  return (
    <div data-shot="steps" className="chat-tile overflow-hidden rounded-xl">
      <div className="chat-tile-head flex h-8 items-center gap-2 px-3 text-xs">
        {running ? <OrbitSpinner className="h-3.5 w-3.5" /> : <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="font-medium text-foreground/90">Build steps</span>
        <span className="ml-auto tabular-nums text-muted-foreground">
          {done}/{steps.length}
        </span>
      </div>
      <ul className="py-1">
        {steps.map(({ label, path, state }, index) => (
          <li key={label}>
            <div className="flex items-center">
              <div className="flex min-h-7 min-w-0 flex-1 items-center gap-2 py-0.5 pl-3 pr-2">
                <StepMark state={state} />
                <span className={cn("min-w-0 truncate text-[12px] transition-colors", state === "done" && "text-muted-foreground", state === "active" && "text-foreground", state === "pending" && "text-muted-foreground/75")}>
                  {label}
                </span>
                <span className="ml-auto shrink-0 pl-2 font-mono text-[11px] text-muted-foreground">{splitPath(path).base}</span>
              </div>
              {lesson?.index === index && (
                <span data-cur="lesson" className={cn("mr-1.5 flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px]", lesson.open ? "text-primary" : "text-muted-foreground")}>
                  <GraduationCap className="h-3.5 w-3.5" />
                  How it works
                  <ChevronDown className={cn("h-3 w-3 transition-transform", !lesson.open && "-rotate-90")} />
                </span>
              )}
            </div>
            {lesson?.index === index && lesson.open && (
              <div className="replica-grow">
                <div className="min-h-0">
                  <div data-shot="lesson" className="relative mb-2 ml-[34px] mr-3 rounded-lg border border-white/[0.1] bg-black/20 py-2.5 pl-4 pr-3 before:absolute before:bottom-3 before:left-0 before:top-3 before:w-[2px] before:rounded-full before:bg-primary/70">
                    <p className="text-[12px] leading-[1.7] text-foreground/90">
                      <strong className="font-semibold text-primary">{lesson.concept}</strong> {lesson.text}
                    </p>
                    {lesson.code && (
                      <div data-cur="ref" className="mt-2 flex items-center gap-2 rounded-md border border-white/[0.1] bg-[hsl(var(--ws-well))] px-1.5 py-0.5 font-mono text-[11px]">
                        <span className="shrink-0 tabular-nums text-primary">L{lesson.line}</span>
                        <span className="min-w-0 truncate text-foreground/85">{lesson.code}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EditsTile({ files }: { files: { path: string; active?: boolean }[] }) {
  const busy = files.some((file) => file.active);
  return (
    <div data-shot="edits" className="chat-tile overflow-hidden rounded-xl">
      <div className="chat-tile-head flex h-8 items-center gap-2 px-3 text-xs">
        {busy ? <OrbitSpinner className="h-3.5 w-3.5" /> : <FilePen className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="font-medium text-foreground/90">
          {busy ? "Editing" : "Edited"} {files.length} {files.length === 1 ? "file" : "files"}
        </span>
      </div>
      <ul className="py-1">
        {files.map(({ path, active }) => {
          const Icon = getFileIcon(path);
          const { dir, base } = splitPath(path);
          return (
            <li key={path} className="chat-enter flex h-7 min-w-0 items-center gap-2 pl-3 pr-2">
              {active ? <OrbitSpinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 shrink-0 text-syntax-string" />}
              <Icon className={cn("h-3.5 w-3.5 shrink-0", getFileColor(path))} />
              <span className="min-w-0 truncate text-[12px]">
                <span className="text-muted-foreground">{dir}</span>
                <span className="text-foreground">{base}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function UsageLine({ percent, used, streaming = false }: { percent: number; used: string; streaming?: boolean }) {
  return (
    <div className="mb-1.5 flex h-7 items-center gap-2.5 px-2">
      <Gauge className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="relative h-1 min-w-[60px] flex-1 overflow-hidden rounded-full bg-white/[0.1]">
        <div className="app-progress-fill !relative h-full rounded-full" style={{ width: `${percent}%` }} />
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">{used}</span> / 2M tokens
      </span>
      <span className="h-3 w-px shrink-0 bg-border" />
      <span className="shrink-0 text-[11px] text-muted-foreground">{streaming ? "Updates after this reply" : "Resets in 7h"}</span>
    </div>
  );
}

export function ModeChip({ teaching = false, cur, press }: { teaching?: boolean; cur?: string; press?: boolean }) {
  const Icon = teaching ? GraduationCap : Hammer;
  return (
    <span data-cur={cur} data-press={press || undefined} className="app-chip inline-flex h-9 shrink-0 items-center gap-2 border px-3.5 text-[13px] font-medium">
      <Icon className={cn("h-4 w-4", teaching && "text-primary")} />
      {teaching ? "Teach me" : "Build"}
      <ChevronDown className="h-3.5 w-3.5 opacity-70" />
    </span>
  );
}

export function SendButton({ ready, press, cur = "send", className, children }: { ready: boolean; press?: boolean; cur?: string; className?: string; children?: ReactNode }) {
  return (
    <button type="button" tabIndex={-1} disabled={!ready} data-cur={cur} data-press={press || undefined} className={cn("app-send h-9 w-9", className)}>
      {children ?? <ArrowUp className="h-4 w-4" />}
    </button>
  );
}

export function Composer({ text = "", placeholder = "Ask Singularity to build or change something…", working = false, teaching = false, focus = false, press = false, modeCur, modePress, menu }: {
  text?: string;
  placeholder?: string;
  working?: boolean;
  teaching?: boolean;
  focus?: boolean;
  press?: boolean;
  modeCur?: string;
  modePress?: boolean;
  menu?: ReactNode;
}) {
  return (
    <div data-shot="composer" data-focus={focus} className="app-glass app-prompt relative rounded-[20px] p-2.5">
      <div className="flex items-start gap-1">
        <span className="prompt-badge mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/70">
          <Sparkles className="h-4 w-4" />
        </span>
        <p data-cur="prompt" className="min-h-[56px] min-w-0 flex-1 px-2.5 py-1.5 text-[14px] leading-6 text-white">
          {text || (focus ? null : <span className="text-white/55">{working ? "Draft your next message while Singularity works…" : placeholder}</span>)}
          {focus && <Caret />}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 pl-2">
        {working ? (
          <span className="flex min-w-0 items-center gap-2 text-xs">
            <OrbitSpinner className="h-3.5 w-3.5" />
            <span className="text-shimmer truncate">Working on it…</span>
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] text-muted-foreground">
            <Kbd>Enter</Kbd> send
            <span className="text-muted-foreground/50">·</span>
            <Kbd>Shift</Kbd> <Kbd>Enter</Kbd> new line
          </span>
        )}
        <div className="relative flex shrink-0 items-center gap-1.5">
          {menu}
          <ModeChip teaching={teaching} cur={modeCur} press={modePress} />
          {working ? (
            <span className="app-stop h-9 w-9 border">
              <Square className="h-3.5 w-3.5 fill-current" />
            </span>
          ) : (
            <SendButton ready={text.trim().length > 0} press={press} />
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatWindow({ children, footer, className, style }: { children: ReactNode; footer: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div data-cascade data-shot="chat" className={cn("ws-window min-h-0", className)} style={style}>
      <div className="app-surface flex h-full flex-col">
        <div className="relative flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
          <div className="px-4 pb-4">{children}</div>
        </div>
        <div className="shrink-0 px-3 pb-3 pt-1">{footer}</div>
      </div>
      <span data-shot="talk" className="pointer-events-none absolute inset-x-0 bottom-[150px] h-[215px]" />
    </div>
  );
}

export function Workspace({ mode, live = false, pressed, sidebar = false, busy = false, split = "34%", people, chat, footer, children }: {
  mode: ViewMode;
  live?: boolean;
  pressed?: string | null;
  sidebar?: boolean;
  busy?: boolean;
  split?: string;
  people?: number;
  chat: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full">
      {sidebar && <Sidebar busy={busy} />}
      <div className={cn("relative flex min-w-0 flex-1 flex-col", !sidebar && "ws-stage")}>
        <WorkHeader mode={mode} live={live} pressed={pressed} people={people} />
        <div className={cn("flex min-h-0 flex-1 gap-2 pb-2 pr-2", !sidebar && "pl-2")}>
          <ChatWindow className="shrink-0" style={{ width: split }} footer={footer}>
            {chat}
          </ChatWindow>
          <div className="relative flex min-w-0 flex-1 gap-2">{children}</div>
        </div>
        <span data-shot="chat-foot" className="pointer-events-none absolute bottom-0 left-0 h-[52%] w-[48%]" />
        <span data-shot="right-top" className="pointer-events-none absolute right-0 top-0 h-[56%] w-[58%]" />
        <span data-shot="right-foot" className="pointer-events-none absolute bottom-0 right-0 h-[56%] w-[58%]" />
      </div>
    </div>
  );
}

export function Dashboard({ sidebar = true, children }: { sidebar?: boolean; children: ReactNode }) {
  return (
    <div className="flex h-full">
      {sidebar && <Sidebar current={null} />}
      <div className={cn("replica-sky relative my-2 mr-2 flex min-w-0 flex-1 flex-col items-center overflow-hidden rounded-2xl border border-[hsl(30_8%_18%)]", !sidebar && "ml-2")}>
        <div className="relative flex w-full max-w-[600px] flex-col items-center px-6 pt-[7%] text-center">{children}</div>
      </div>
    </div>
  );
}

const SYNTAX =
  /(\/\/.*$|"[^"]*"|'[^']*'|`[^`]*`|\b(?:import|from|export|default|function|return|const|let|new|while|for|if|else|await|async|type|interface)\b|\b\d+(?:\.\d+)?\b|<\/?[A-Za-z][\w.]*|\b[A-Za-z_]\w*(?=\()|[{}()[\];,.<>=+\-*/!?:&|])/;
const KEYWORD = /^(?:import|from|export|default|function|return|const|let|new|while|for|if|else|await|async|type|interface)$/;

function toneOf(part: string) {
  if (part.startsWith("//")) return "italic text-[hsl(30_8.4%_62%)]";
  if (/^["'`]/.test(part)) return "text-syntax-string";
  if (KEYWORD.test(part)) return "text-syntax-keyword";
  if (/^\d/.test(part)) return "text-syntax-number";
  if (part.startsWith("<")) return "text-primary";
  if (/^[A-Za-z_]/.test(part)) return "text-syntax-function";
  return "text-muted-foreground";
}

export function CodeText({ text }: { text: string }) {
  return (
    <>
      {text.split(SYNTAX).map((part, index) =>
        part ? (
          <span key={index} className={index % 2 === 1 ? toneOf(part) : "text-foreground"}>
            {part}
          </span>
        ) : null
      )}
    </>
  );
}

const TAIL_ROOM = 10;

const LINE_TONE: Record<NonNullable<CodeLine["tone"]>, string> = {
  add: "bg-[hsl(149_38.5%_54.3%/0.16)]",
  del: "bg-[hsl(352_62%_50%/0.14)]",
  pick: "bg-primary/20",
  flash: "demo-flash",
};


export function EditorWindow({ tabs, active, lines, caret = false, current, top = 0, dots = [], lens = false, toolbar, overlay, className }: {
  tabs: string[];
  active: string;
  lines: CodeLine[];
  caret?: boolean;
  current?: number;
  top?: number;
  dots?: string[];
  lens?: boolean;
  toolbar?: ReactNode;
  overlay?: ReactNode;
  className?: string;
}) {
  let count = 0;
  const scroller = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = scroller.current;
    const port = node?.parentElement;
    if (!node || !port) return;
    const rows = node.children;
    const first = rows[0] as HTMLElement | undefined;
    const last = rows[rows.length - 1] as HTMLElement | undefined;
    const lead = rows[Math.min(top, rows.length - 1)] as HTMLElement | undefined;
    let offset = first && lead && top > 0 ? lead.offsetTop - first.offsetTop : 0;
    if (caret && first && last) offset = Math.max(offset, last.offsetTop + last.offsetHeight - first.offsetTop + TAIL_ROOM - port.clientHeight);
    const next = offset > 0 ? `translate3d(0, ${-offset}px, 0)` : "";
    if (node.style.transform !== next) node.style.transform = next;
  });

  return (
    <div data-shot="editor" className={cn("ws-window flex min-h-0 min-w-0 flex-col", className)}>
      <div className="ws-bar flex h-11 shrink-0 items-stretch gap-1 px-1.5 py-1.5">
        <div className="flex min-w-0 flex-1 items-stretch gap-1 overflow-hidden">
          {tabs.map((path) => {
            const Icon = getFileIcon(path);
            const selected = path === active;
            return (
              <div
                key={path}
                aria-selected={selected}
                className={cn("tab-hl chat-enter relative flex items-center gap-2 rounded-xl pl-3 pr-1.5 text-[13px]", selected ? "shrink-0 font-medium" : "min-w-[3rem] shrink text-muted-foreground")}
              >
                <Icon className={cn("h-3.5 w-3.5 shrink-0", getFileColor(path))} />
                <span className="truncate">{splitPath(path).base}</span>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {dots.includes(path) ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : selected ? <X className="h-3 w-3 text-muted-foreground" /> : null}
                </span>
              </div>
            );
          })}
        </div>
        {toolbar ?? (
          <span className="flex shrink-0 items-center">
            <span data-cur="lens" data-active={lens} className="icon-btn h-8 w-8 rounded-lg [&_svg]:size-4">
              <MessagesSquare />
            </span>
            <span className="icon-btn h-8 w-8 rounded-lg [&_svg]:size-4">
              <Copy />
            </span>
            <span className="icon-btn h-8 w-8 rounded-lg [&_svg]:size-4">
              <Download />
            </span>
          </span>
        )}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-x-0 bottom-0 top-2 overflow-hidden">
          <div ref={scroller} className="replica-scroll pb-2">
            {lines.map((line, index) => {
              const number = line.n ?? (count += 1);
              const last = index === lines.length - 1;
              return (
                <div key={index}>
                  <div
                    data-shot={line.tone === "pick" || line.tone === "flash" ? "pick" : undefined}
                    data-cur={`line-${index + 1}`}
                    className={cn("flex whitespace-pre-wrap font-mono text-[13.5px] [overflow-wrap:anywhere]", line.tone && LINE_TONE[line.tone], index === current && !line.tone && "bg-white/[0.035]")}
                    style={{ minHeight: LINE_H, lineHeight: `${LINE_H}px` }}
                  >
                    <span className={cn("w-12 shrink-0 select-none pr-4 text-right text-[12px] tabular-nums", index === current ? "font-semibold text-foreground" : "text-muted-foreground/70", line.tone === "add" && "text-syntax-string", line.tone === "del" && "text-[hsl(352_70%_70%)]")}>
                      {number}
                    </span>
                    <span className={cn("min-w-0 flex-1 pr-3", line.tone === "del" && "opacity-70")}>
                      <CodeText text={line.text} />
                      {caret && last && <Caret />}
                    </span>
                  </div>
                  {line.note !== undefined && (
                    <div className="replica-grow">
                      <div className="min-h-0">
                        <p data-shot="note" className="my-1 ml-12 mr-4 border-l-2 border-primary/70 pl-3 font-display text-[14px] italic leading-6 text-[hsl(44_90%_80%)]">
                          {line.note}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {overlay}
      </div>
      <span data-shot="code" className="pointer-events-none absolute left-0 top-0 h-[214px] w-[450px] max-w-full" />
    </div>
  );
}

type TreeNode = { name: string; path: string; children?: TreeNode[] };

function treeOf(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const path of [...paths].sort((a, b) => a.localeCompare(b))) {
    let level = root;
    let walked = "";
    const parts = path.split("/");
    parts.forEach((part, index) => {
      walked = walked ? `${walked}/${part}` : part;
      let node = level.find((item) => item.path === walked);
      if (!node) {
        node = { name: part, path: walked, children: index < parts.length - 1 ? [] : undefined };
        level.push(node);
      }
      level = node.children ?? level;
    });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => Number(!a.children) - Number(!b.children) || a.name.localeCompare(b.name));
    nodes.forEach((node) => node.children && sort(node.children));
  };
  sort(root);
  return root;
}

function TreeRows({ nodes, depth, selected, changed, writing }: { nodes: TreeNode[]; depth: number; selected?: string; changed: string[]; writing?: string }) {
  return (
    <>
      {nodes.map((node) => {
        const Icon = node.children ? FolderOpen : getFileIcon(node.name);
        const active = node.path === selected;
        return (
          <div key={node.path}>
            <div
              data-cur={node.children ? undefined : `file-${node.name}`}
              className={cn("chat-enter relative flex h-7 items-center gap-1.5 rounded-xl pr-2 text-[13px]", active ? "row-active font-medium" : "text-muted-foreground")}
              style={{ paddingLeft: depth * 12 + 6 }}
            >
              {node.children ? <ChevronRight className="h-3.5 w-3.5 shrink-0 rotate-90 text-muted-foreground" /> : <span className="w-3.5 shrink-0" />}
              <Icon className={cn("h-4 w-4 shrink-0", node.children ? "text-amber-400/90" : getFileColor(node.name))} />
              <span className="truncate">{node.name}</span>
              {node.path === writing ? <OrbitSpinner className="ml-auto h-3.5 w-3.5" /> : changed.includes(node.path) ? <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /> : null}
            </div>
            {node.children && <TreeRows nodes={node.children} depth={depth + 1} selected={selected} changed={changed} writing={writing} />}
          </div>
        );
      })}
    </>
  );
}

export function FileTreeWindow({ files, selected, changed = [], writing, query, results, className }: {
  files: string[];
  selected?: string;
  changed?: string[];
  writing?: string;
  query?: ReactNode;
  results?: ReactNode;
  className?: string;
}) {
  return (
    <div data-shot="tree" className={cn("ws-window flex min-h-0 w-[232px] shrink-0 flex-col", className)}>
      <div className="ws-bar flex h-11 shrink-0 items-center gap-0.5 pl-3.5 pr-1.5">
        <span className="flex-1 text-[13px] font-medium">Files</span>
        <span className="icon-btn h-7 w-7 rounded-lg [&_svg]:size-3.5">
          <ChevronsUpDown />
        </span>
        <span className="icon-btn h-7 w-7 rounded-lg [&_svg]:size-3.5">
          <ChevronsDownUp />
        </span>
      </div>
      <div className="px-2 pt-2">
        <div data-shot="find" data-cur="find" className="app-field flex h-8 items-center gap-2 rounded-lg border px-2.5 text-[13px]">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {query ?? <span className="text-muted-foreground">Find in files…</span>}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-1.5">{results ?? <TreeRows nodes={treeOf(files)} depth={0} selected={selected} changed={changed} writing={writing} />}</div>
      <span data-shot="tree-top" className="pointer-events-none absolute inset-x-0 top-0 h-[250px]" />
    </div>
  );
}

export type PreviewState = "idle" | "starting" | "live";

export function PreviewBar({ state, address = "running-club.preview.singularity.dev/", reloading = false }: { state: PreviewState; address?: string; reloading?: boolean }) {
  return (
    <div className="ws-bar flex h-11 shrink-0 items-center gap-1 px-2 text-xs text-muted-foreground">
      <span data-cur="reload" className="icon-btn h-7 w-7 rounded-lg [&_svg]:size-3.5">
        <RotateCw className={cn(reloading && "animate-spin")} />
      </span>
      <div data-shot="address" className="app-field mx-1 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-full border px-3">
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            state === "live" ? "bg-syntax-string shadow-[0_0_0_3px_hsl(var(--syntax-string)/0.18)]" : state === "starting" ? "animate-pulse bg-primary" : "bg-muted-foreground/60"
          )}
        />
        <span className={cn("min-w-0 flex-1 truncate font-mono text-[11px]", state === "live" ? "text-foreground/85" : "text-muted-foreground")}>{state === "live" ? address : "Live preview"}</span>
      </div>
      {[Smartphone, Link2, ExternalLink, SquareTerminal, RotateCcw].map((Icon, index) => (
        <span key={index} data-cur={Icon === SquareTerminal ? "output" : undefined} className={cn("icon-btn h-7 w-7 rounded-lg [&_svg]:size-3.5", state === "idle" && "opacity-45")}>
          <Icon />
        </span>
      ))}
      {state !== "idle" && (
        <span className="icon-btn h-7 w-7 rounded-lg [&_svg]:size-3.5">
          <Square />
        </span>
      )}
    </div>
  );
}

function Centered({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="relative mb-1">
        <span className="empty-glow absolute -inset-[95%]" />
        <div className="idle-tile relative flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-[hsl(30_11%_16%)] text-[hsl(46_100%_86%)] shadow-[0_14px_30px_-18px_hsl(32.8_100%_60%/0.6)]">
          {icon}
        </div>
      </div>
      <h3 className="font-display text-[24px] font-semibold leading-tight tracking-tight text-white">{title}</h3>
      {children}
    </div>
  );
}

export function PreviewWindow({ state, step = 0, seconds, reloading = false, press = false, children, extra, drawer, className }: {
  state: PreviewState;
  step?: number;
  seconds?: number;
  reloading?: boolean;
  press?: boolean;
  children?: ReactNode;
  extra?: ReactNode;
  drawer?: ReactNode;
  className?: string;
}) {
  return (
    <div data-cascade data-shot="preview" className={cn("ws-window flex min-h-0 min-w-0 flex-col", className)}>
      <PreviewBar state={state} reloading={reloading} />
      {state === "idle" && (
        <>
          <Centered icon={<Play className="h-5 w-5 translate-x-px" />} title="Preview your app">
            <span data-cur="start" data-press={press || undefined} className="btn btn-primary btn-invite mt-1 inline-flex h-9 items-center gap-1.5 rounded-full px-5 text-[13px] font-semibold">
              <Play className="h-3.5 w-3.5" />
              Start preview
            </span>
          </Centered>
          <div className="flex shrink-0 justify-center gap-2 pb-4">
            {(
              [
                [CodeXml, "View code"],
                [Download, "Download ZIP"],
              ] as const
            ).map(([Icon, label]) => (
              <span key={label} className="btn btn-glass inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </span>
            ))}
          </div>
        </>
      )}
      {state === "starting" && (
        <Centered icon={<OrbitSpinner className="h-6 w-6" />} title="Starting your preview">
          <ol data-shot="boot" className="w-full max-w-[260px] space-y-2 text-left text-xs">
            {PREVIEW_STEPS.map((item, index) => (
              <li key={item.detail} className={cn("flex items-center gap-2", index < step ? "text-muted-foreground" : index > step && "text-muted-foreground/70")}>
                {index < step ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-syntax-string" />
                ) : index === step ? (
                  <OrbitSpinner className="h-3.5 w-3.5" />
                ) : (
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    <span className="h-1 w-1 rounded-full bg-current" />
                  </span>
                )}
                <span className={cn(index === step && "text-foreground")}>{item.label}</span>
              </li>
            ))}
          </ol>
          {seconds !== undefined && <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{seconds}s</p>}
        </Centered>
      )}
      {state === "live" && (
        <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
          <div className="chat-enter h-full">{children}</div>
          <div className={cn("pointer-events-none absolute inset-0 flex items-center justify-center bg-[hsl(var(--ws-window)/0.7)] transition-opacity duration-300", reloading ? "opacity-100" : "opacity-0")}>
            <OrbitSpinner className="h-6 w-6" />
          </div>
          {extra}
        </div>
      )}
      {drawer}
    </div>
  );
}

const CALENDAR = [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1];
const DISTANCES = [5.2, 3.1, 0, 7.4, 4.8, 10.5, 6.2];
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const LEADERS = [
  { name: "Asha", days: 31, width: 92, cheers: 14, hue: 22 },
  { name: "You", days: 12, width: 46, cheers: 6, hue: 212 },
  { name: "Marco", days: 9, width: 34, cheers: 3, hue: 152 },
  { name: "Sam", days: 6, width: 22, cheers: 2, hue: 280 },
];

export function ClubApp({ t, chart = false, dark = false, cheers = false, zone = false, scroll = 0, broken = false }: {
  t: number;
  chart?: boolean;
  dark?: boolean;
  cheers?: boolean;
  zone?: boolean;
  scroll?: number;
  broken?: boolean;
}) {
  const streak = Math.round(12 * ease(span(t, 100, 1100)));
  const muted = dark ? "text-[hsl(30_6%_66%)]" : "text-[hsl(30_6%_46%)]";
  const card = dark ? "border-white/10 bg-[hsl(30_9%_10%)]" : "border-[hsl(36_20%_86%)] bg-white";
  const track = dark ? "hsl(30 7% 19%)" : "hsl(40 13% 89%)";

  return (
    <div className={cn("h-full overflow-hidden font-sans transition-colors duration-700", dark ? "bg-[hsl(30_11%_6%)] text-[hsl(40_27%_96%)]" : "bg-[hsl(40_35%_97%)] text-[hsl(30_11%_11%)]", broken && "grayscale")}>
      <div className="replica-scroll" style={{ transform: `translate3d(0, ${-scroll}px, 0)` }}>
        <div className={cn("flex items-center justify-between border-b px-6 py-3.5", dark ? "border-white/10" : "border-[hsl(36_20%_88%)]")}>
          <span className="flex items-center gap-2 font-display text-[19px] font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[hsl(28_96%_58%)] text-white">
              <Flame className="h-4 w-4" />
            </span>
            Running Club
          </span>
          <span className={cn("hidden items-center gap-5 text-[13px] sm:flex", muted)}>
            <span className={dark ? "text-white" : "text-[hsl(30_11%_11%)]"}>Dashboard</span>
            <span>Club</span>
            <span>Races</span>
          </span>
          <span className="rounded-full bg-[hsl(34_100%_62%)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[hsl(28_90%_8%)]">Log a run</span>
        </div>

        <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-4 px-6 pt-5">
          <div data-shot="streak" className={cn("rounded-2xl border p-4", card)}>
            <p className={cn("text-[11px] font-medium uppercase tracking-[0.14em]", muted)}>Your streak</p>
            <p className={cn("mt-1 flex items-end gap-1.5 font-display font-semibold leading-none tabular-nums transition-[font-size] duration-700", dark ? "text-[72px]" : "text-[54px]")}>
              {streak}
              <Flame className="mb-1.5 h-7 w-7 text-[hsl(28_96%_58%)]" />
            </p>
            <p className={cn("mt-2 text-[12.5px]", muted)}>days in a row</p>
            {zone && <p className="chat-enter mt-2 inline-flex rounded-full bg-[hsl(34_100%_62%/0.16)] px-2 py-0.5 text-[11px] font-medium text-[hsl(26_90%_42%)]">resets at your midnight · IST</p>}
          </div>
          <div className={cn("rounded-2xl border p-4", card)}>
            <p className={cn("text-[11px] font-medium uppercase tracking-[0.14em]", muted)}>Last four weeks</p>
            <div className="mt-3 grid grid-cols-7 gap-1.5">
              {CALENDAR.map((filled, index) => (
                <span
                  key={index}
                  className="aspect-square rounded-[5px] transition-colors duration-300"
                  style={{ background: filled && t > index * 32 ? `hsl(${24 + (index % 5) * 5} 96% ${56 + (index % 3) * 5}%)` : track }}
                />
              ))}
            </div>
          </div>
        </div>

        {chart && (
          <div className="replica-grow">
            <div className="min-h-0">
              <div data-shot="chart" className={cn("mx-6 mt-4 rounded-2xl border p-4", card)}>
                <p className={cn("text-[11px] font-medium uppercase tracking-[0.14em]", muted)}>This week · km</p>
                <div className="mt-3 flex h-24 items-end gap-2.5">
                  {DISTANCES.map((km, index) => (
                    <span key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                      <span
                        className="w-full rounded-t-md bg-[hsl(34_100%_62%)] transition-[height] duration-700 ease-out"
                        style={{ height: t > 260 + index * 70 ? `${Math.max(4, (km / 10.5) * 100)}%` : "4%", opacity: index === 5 ? 1 : 0.55 }}
                      />
                      <span className={cn("text-[10.5px]", muted)}>{DAYS[index]}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div data-shot="board" className={cn("mx-6 mb-6 mt-4 rounded-2xl border p-4", card)}>
          <p className={cn("text-[11px] font-medium uppercase tracking-[0.14em]", muted)}>Leaderboard</p>
          <ul className="mt-3 space-y-2.5">
            {LEADERS.map((leader, index) => (
              <li key={leader.name} className="flex items-center gap-3 text-[13px]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ background: `hsl(${leader.hue} 62% 52%)` }}>
                  {leader.name.charAt(0)}
                </span>
                <span className="w-14 shrink-0 truncate font-medium">{leader.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: track }}>
                  <span className="block h-full rounded-full bg-[hsl(34_100%_62%)] transition-[width] duration-700 ease-out" style={{ width: t > 380 + index * 110 ? `${leader.width}%` : "0%" }} />
                </span>
                <span className="w-7 shrink-0 text-right tabular-nums">{leader.days}</span>
                {cheers && (
                  <span className="chat-enter shrink-0 rounded-full bg-[hsl(34_100%_62%/0.16)] px-2 py-0.5 text-[11.5px] font-medium tabular-nums text-[hsl(30_96%_60%)]">
                    🔥 {leader.cheers + (t > 1300 + index * 420 ? 1 : 0)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function DashHeadline({ lead = "Got an idea,", accent = "Asha?", eyebrow }: { lead?: string; accent?: string; eyebrow?: string }) {
  return (
    <>
      {eyebrow ? (
        <span className="app-eyebrow">{eyebrow}</span>
      ) : (
        <span className="relative inline-flex h-14 w-14">
          <span className="empty-glow absolute -inset-[110%]" />
          <HorizonMark className="relative h-full w-full" />
        </span>
      )}
      <h1 className="landing-heading dash-headline mt-5 font-display text-[52px] font-semibold leading-[1.04] tracking-[-0.025em]">
        <HeadlineWords text={lead} />{" "}
        <em data-word className="heat-text -mb-[0.1em] inline-block pb-[0.1em] pr-2 font-semibold not-italic">
          {accent}
        </em>
      </h1>
    </>
  );
}

export function DashPrompt({ text = "", focus = false, press = false, teaching = false, modeCur }: { text?: string; focus?: boolean; press?: boolean; teaching?: boolean; modeCur?: string }) {
  return (
    <div data-shot="prompt" data-focus={focus} className="app-glass app-prompt relative w-full rounded-[22px] p-3 text-left">
      <div className="flex items-start">
        <span className="prompt-badge mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/70">
          <Sparkles className="h-4 w-4" />
        </span>
        <p data-cur="prompt" className="min-h-[64px] min-w-0 flex-1 px-3 pt-1.5 text-[15px] leading-6 tracking-[-0.005em] text-white">
          {text || (focus ? null : <span className="text-white/55">Ask Singularity to build a habit tracker with daily streaks</span>)}
          {focus && <Caret />}
        </p>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 pl-2">
        <span className="min-w-0 truncate text-xs text-muted-foreground">Enter to create · Shift+Enter for a new line</span>
        <div className="flex shrink-0 items-center gap-2">
          <ModeChip teaching={teaching} cur={modeCur} />
          <SendButton ready={text.trim().length > 0} press={press} />
        </div>
      </div>
    </div>
  );
}

const IDEAS: [LucideIcon, string][] = [
  [ListChecks, "A todo app with drag and drop"],
  [Camera, "A portfolio site for a photographer"],
  [Layers, "A pricing page with three tiers"],
];

export function IdeaChips() {
  return (
    <div className="mt-5 flex flex-wrap justify-center gap-2">
      {IDEAS.map(([Icon, idea]) => (
        <span key={idea} className="idea-chip">
          <Icon className="h-3.5 w-3.5 shrink-0 text-white/55" />
          {idea}
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-white/45" />
        </span>
      ))}
    </div>
  );
}

export interface Question {
  ask: string;
  helper: string;
  options: string[];
  multi?: boolean;
}

export function Clarifier({ idea, questions, index, picked, phase, answers = [], press = false }: {
  idea: string;
  questions: Question[];
  index: number;
  picked: number[];
  phase: "loading" | "asking" | "review" | "compiling";
  answers?: string[];
  press?: boolean;
}) {
  const question = questions[index];
  const steps = questions.length + 1;
  const step = phase === "asking" ? index : questions.length;

  return (
    <div data-shot="clarifier" className="app-glass relative w-full rounded-[22px] text-left">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          &ldquo;<span className="text-foreground/90">{idea}</span>&rdquo;
        </p>
        <span className="flex shrink-0 items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
          <PenLine className="h-3 w-3" />
          Edit idea
        </span>
      </div>
      <div className="px-5 pb-5 pt-4">
        {phase === "loading" ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <OrbitSpinner className="h-7 w-7" />
            <p className="text-shimmer mt-2 text-sm">Tailoring a few questions to your idea…</p>
            <p className="text-xs text-muted-foreground">Only what's needed, and you can skip any of them.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{phase === "asking" ? `Question ${index + 1} of ${questions.length}` : "Review"}</span>
              {phase === "asking" && <span className="px-2 py-1 text-xs text-muted-foreground">Skip questions</span>}
            </div>
            <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${steps}, minmax(0, 1fr))` }}>
              {Array.from({ length: steps }, (_, bar) => (
                <span key={bar} className={cn("h-1 rounded-full transition-[background-color] duration-500", bar < step ? "bg-primary/60" : bar === step ? "bg-primary" : "bg-white/[0.08]")} />
              ))}
            </div>
            {phase === "asking" ? (
              <div key={question.ask} className="chat-enter">
                <span data-shot="question" className="pointer-events-none absolute inset-x-0 top-[104px] h-[236px]" />
                <h2 className="mt-5 font-display text-[22px] font-semibold leading-tight tracking-tight text-foreground">{question.ask}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{question.helper}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {question.options.map((option, order) => {
                    const chosen = picked.includes(order);
                    return (
                      <span
                        key={option}
                        data-cur={`option-${order}`}
                        className={cn(
                          "flex min-h-10 items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition-[border-color,background-color,color,box-shadow,padding] duration-300",
                          chosen ? "row-active border-transparent pl-4 text-foreground" : "border-white/[0.07] bg-black/20 text-foreground/90"
                        )}
                      >
                        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-medium transition-colors", chosen ? "border-transparent bg-primary text-primary-foreground" : "border-white/10 text-muted-foreground")}>
                          {chosen ? <Check className="h-3 w-3" /> : order + 1}
                        </span>
                        <span className="min-w-0 flex-1">{option}</span>
                      </span>
                    );
                  })}
                  <span className="flex min-h-10 items-center gap-2.5 rounded-xl border border-dashed border-white/10 px-3 py-2 text-sm text-muted-foreground">
                    <Plus className="h-4 w-4 shrink-0" />
                    Something else
                  </span>
                </div>
                <div className="mt-5 flex items-center justify-between gap-2">
                  <span className="flex h-8 items-center gap-1.5 px-3 text-xs font-medium text-foreground/60">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground">{question.multi ? "Pick as many as you like · Enter to continue" : `Press 1–${question.options.length} to choose`}</span>
                    <SendButton ready press={press} className="h-8 w-auto gap-1.5 px-3.5 text-xs font-medium">
                      {picked.length > 0 ? "Continue" : "Skip"}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </SendButton>
                  </div>
                </div>
              </div>
            ) : (
              <div className="chat-enter">
                <h2 className="mt-5 font-display text-[22px] font-semibold leading-tight tracking-tight text-foreground">Here&rsquo;s the plan</h2>
                <p className="mt-1 text-sm text-muted-foreground">Singularity will turn this into a project brief and start building.</p>
                <dl data-shot="plan" className="mt-4 divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
                  {questions.map((item, order) => (
                    <div key={item.ask} className="flex items-start gap-3 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <dt className="text-xs text-muted-foreground">{item.ask}</dt>
                        <dd className="mt-0.5 text-sm text-foreground">{answers[order]}</dd>
                      </div>
                      <span className="shrink-0 px-2 py-1 text-xs text-muted-foreground">Edit</span>
                    </div>
                  ))}
                </dl>
                <div className="mt-5 flex items-center justify-between gap-2">
                  <span className="flex h-8 items-center gap-1.5 px-3 text-xs font-medium text-foreground/60">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </span>
                  <SendButton ready press={press} className="h-9 w-auto gap-2 px-4 text-sm font-medium">
                    {phase === "compiling" ? (
                      <>
                        <OrbitSpinner className="h-4 w-4" />
                        Writing your brief…
                      </>
                    ) : (
                      <>
                        Build it
                        <ArrowUp className="h-4 w-4" />
                      </>
                    )}
                  </SendButton>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function LensWindow({ selection, question, asking = "", reading = false, read, answer, done = false, press = false, className }: {
  selection?: { file: string; lines: string };
  question?: string;
  asking?: string;
  reading?: boolean;
  read?: string;
  answer?: string;
  done?: boolean;
  press?: boolean;
  className?: string;
}) {
  return (
    <div data-shot="lens" className={cn("ws-window chat-enter min-h-0 w-[300px] shrink-0", className)}>
      <div className="app-surface flex h-full flex-col">
      <div className="ws-bar flex h-11 shrink-0 items-center gap-1 pl-3.5 pr-1.5">
        <HorizonMark className="mr-1 h-4 w-4" />
        <span className="flex-1 truncate font-display text-[14px] font-semibold tracking-tight text-foreground">
          Explain<em className="heat-text pr-0.5 font-medium">LLM</em>
        </span>
        <span className="icon-btn h-7 w-7 rounded-lg [&_svg]:size-3.5">
          <X />
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-3 pb-3.5">
        {!question && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <span className="prompt-card-icon mb-1 h-10 w-10 rounded-xl">
              <MessagesSquare className="h-5 w-5" />
            </span>
            <p className="max-w-[16rem] text-xs text-muted-foreground">Ask anything about the code you selected - or about the project in general.</p>
          </div>
        )}
        {question && (
          <Grow gap={false} className="pt-3.5">
            <Bubble>{question}</Bubble>
          </Grow>
        )}
        {question && reading && (
          <Grow gap={false} className="pt-3.5">
            <Working label="Reading the code" />
          </Grow>
        )}
        {read && (
          <Grow gap={false} className="pt-3.5">
            <ReadRow files={[read]} />
          </Grow>
        )}
        {answer !== undefined && (
          <Grow gap={false} className="pt-3">
            <p data-shot="answer" className="text-[13px] leading-[1.65] text-foreground/90">
              {answer}
              {!done && <Caret />}
            </p>
          </Grow>
        )}
      </div>
      <span data-shot="answer-zone" className="pointer-events-none absolute inset-x-0 bottom-0 h-[320px]" />
      <div className="shrink-0 border-t border-white/[0.08] p-2.5">
        {selection && (
          <div className="ws-card mb-1.5 flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10.5px] text-muted-foreground">
            <span className="shrink-0 uppercase tracking-wider">Asking about</span>
            <span className="truncate font-medium text-foreground/80">{selection.file}</span>
            <span className="shrink-0">{selection.lines}</span>
          </div>
        )}
        <div data-shot="ask" className="app-field flex items-end gap-1.5 rounded-2xl border p-1.5">
          <p data-cur="ask" className="min-w-0 flex-1 px-1.5 py-1 text-[13px] text-foreground">
            {asking || <span className="text-muted-foreground">Ask about this code…</span>}
            {asking && <Caret />}
          </p>
          <SendButton ready={asking.length > 0} press={press} cur="lens-send" className="h-7 w-7">
            <ArrowUp className="h-3.5 w-3.5" />
          </SendButton>
        </div>
      </div>
      </div>
    </div>
  );
}
