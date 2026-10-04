/**
 * The app's own prompt, on the landing page: the first thing a visitor can do here is the first thing they will do in
 * the app.
 *
 * Handles: the dashboard's prompt as it is in the app - the spark badge, a box that grows with what is typed, the
 * example ideas typing themselves out while it is empty and on screen (the dashboard's own list,
 * lib/idea-suggestions), the Build / Teach me menu (PromptModeMenu) and the send button that lights once there is
 * something to send - and sending: the idea and the chosen mode are kept (lib/pending-idea) and the visitor leaves for
 * sign-up by the page slide, to find the idea waiting in the dashboard's prompt once they are in. Enter sends,
 * Shift+Enter breaks the line, as in the app. Under it, when the caller passes chips, the dashboard's quick-start chips:
 * pressing one types its idea into the prompt a letter at a time (TYPE_MS) and leaves the caret at its end, ready to
 * send or to change.
 *
 * It wears exactly the dashboard's prompt (the .dash-night scope round it gives it the dashboard's solid grey card with
 * the gold wash along its leading edge, the dashboard's chip and its resting send button), not glass: it stands over
 * the eclipse's light, and a frosted panel over a canvas that redraws would be re-blurred on every frame. .ln-prompt
 * only adds the deeper shadow it needs to float over the night.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowUp, ArrowUpRight, Sparkles, type LucideIcon } from "lucide-react";
import { PromptModeMenu } from "@/components/PromptModeMenu";
import { useInView } from "@/components/landing/motion";
import { useSlideNavigate } from "@/hooks/use-slide-navigate";
import { useTypewriterPlaceholder } from "@/hooks/use-typewriter-placeholder";
import { IDEA_SUGGESTIONS } from "@/lib/idea-suggestions";
import { MAX_LENGTH, savePendingIdea } from "@/lib/pending-idea";
import { cn } from "@/lib/utils";

const MAX_HEIGHT = 168;
const TYPE_MS = 22;

export interface IdeaChip {
  idea: string;
  icon: LucideIcon;
}

const fit = (box: HTMLTextAreaElement) => {
  box.style.height = "auto";
  box.style.height = `${Math.min(box.scrollHeight, MAX_HEIGHT)}px`;
};

export function IdeaPrompt({
  className,
  style,
  label = "Describe the app you want to build",
  chips,
}: {
  className?: string;
  style?: CSSProperties;
  label?: string;
  chips?: IdeaChip[];
}) {
  const [text, setText] = useState("");
  const [teaching, setTeaching] = useState(false);
  const [ref, visible] = useInView<HTMLFormElement>({ once: false, threshold: 0.2, rootMargin: "0px" });
  const placeholder = useTypewriterPlaceholder(IDEA_SUGGESTIONS, visible && text.length === 0);
  const slide = useSlideNavigate();
  const box = useRef<HTMLTextAreaElement>(null);
  const ready = text.trim().length > 0;
  const typing = useRef(0);

  useEffect(() => () => window.clearInterval(typing.current), []);

  const typeIn = (idea: string) => {
    window.clearInterval(typing.current);
    const field = box.current;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(idea);
      requestAnimationFrame(() => field && (fit(field), field.focus()));
      return;
    }
    let count = 0;
    typing.current = window.setInterval(() => {
      count += 1;
      setText(idea.slice(0, count));
      if (field) fit(field);
      if (count >= idea.length) {
        window.clearInterval(typing.current);
        field?.focus();
        field?.setSelectionRange(idea.length, idea.length);
      }
    }, TYPE_MS);
  };

  const send = () => {
    if (!ready) {
      box.current?.focus();
      return;
    }
    savePendingIdea({ text, teaching });
    slide("/signup");
  };

  return (
    <div className={cn("dash-night", className)} style={style}>
      <form
        ref={ref}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="ln-prompt app-prompt group relative w-full rounded-[22px] p-3 text-left"
      >
        <div className="flex items-start">
          <span aria-hidden="true" className="prompt-badge mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/70">
            <Sparkles className="no-icon-anim h-4 w-4" />
          </span>
          <textarea
            ref={box}
            value={text}
            rows={2}
            maxLength={MAX_LENGTH}
            aria-label={label}
            placeholder={`Ask Singularity to build ${placeholder}`}
            onChange={(event) => {
              setText(event.target.value);
              fit(event.target);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
            className="app-prompt-input block min-h-[64px] w-full flex-1 resize-none bg-transparent px-3 pt-1.5 text-[15px] font-normal leading-6 tracking-[-0.005em] text-white caret-white outline-none placeholder:text-white/70"
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 pl-2">
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            <span className="hidden sm:inline">Enter to start · Shift+Enter for a new line</span>
            <span className="sm:hidden">Free to start</span>
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <PromptModeMenu teaching={teaching} onChange={setTeaching} />
            <button type="submit" aria-label="Start building this idea" disabled={!ready} className="app-send h-9 w-9">
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </form>
      {chips && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {chips.map(({ idea, icon: Icon }) => (
            <button key={idea} type="button" onClick={() => typeIn(idea)} className="idea-chip group/idea">
              <Icon className="h-3.5 w-3.5 shrink-0 text-white/55 transition-all duration-300 group-hover/idea:text-[hsl(46_100%_85%)]" />
              {idea}
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-white/45 transition-all duration-300 group-hover/idea:translate-x-0.5 group-hover/idea:text-[hsl(46_100%_85%)]" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
