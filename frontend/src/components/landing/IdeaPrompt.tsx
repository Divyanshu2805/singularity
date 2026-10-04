/**
 * The app's own prompt, on the home page: the first thing a visitor can do there is the first thing they will do in
 * the app.
 *
 * Handles: the dashboard's prompt as it is in the app - the spark badge, a box that grows with what is typed, the
 * example ideas typing themselves out while it is empty and on screen (the dashboard's own list,
 * lib/idea-suggestions), the Build / Teach me menu (PromptModeMenu) and the send button that lights once there is
 * something to send - and sending: the idea and the chosen mode are kept (lib/pending-idea) and the visitor leaves for
 * sign-up by the page slide, to find the idea waiting in the dashboard's prompt once they are in. Enter sends,
 * Shift+Enter breaks the line, as in the app. Nothing is sent anywhere from here and nothing is built by itself.
 *
 * It wears exactly the dashboard's prompt (the .dash-night scope round it gives it the dashboard's solid card, its
 * chip and its resting send button); home.css's .home-prompt only adds the deeper shadow it needs to stand on the
 * open sky. The home page shows it twice - under the headline and as the page's closing call - and each keeps its own
 * text. onType tells the caller how much has been typed, each time it changes: the hero uses it to feed the light
 * under the prompt and to send small ripples across its sheet (HeroFabric), so the visitor's own idea bends the page.
 */
import { useRef, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { PromptModeMenu } from "@/components/PromptModeMenu";
import { useSlideNavigate } from "@/hooks/use-slide-navigate";
import { useTypewriterPlaceholder } from "@/hooks/use-typewriter-placeholder";
import { IDEA_SUGGESTIONS } from "@/lib/idea-suggestions";
import { MAX_LENGTH, savePendingIdea } from "@/lib/pending-idea";
import { cn } from "@/lib/utils";
import { useInView } from "./motion";

const MAX_HEIGHT = 168;

const fit = (box: HTMLTextAreaElement) => {
  box.style.height = "auto";
  box.style.height = `${Math.min(box.scrollHeight, MAX_HEIGHT)}px`;
};

export function IdeaPrompt({
  className,
  label = "Describe the app you want to build",
  onType,
}: {
  className?: string;
  label?: string;
  onType?: (length: number) => void;
}) {
  const [text, setText] = useState("");
  const [teaching, setTeaching] = useState(false);
  const [ref, visible] = useInView<HTMLFormElement>({ once: false, threshold: 0.2, rootMargin: "0px" });
  const placeholder = useTypewriterPlaceholder(IDEA_SUGGESTIONS, visible && text.length === 0);
  const slide = useSlideNavigate();
  const box = useRef<HTMLTextAreaElement>(null);
  const ready = text.trim().length > 0;

  const send = () => {
    if (!ready) {
      box.current?.focus();
      return;
    }
    savePendingIdea({ text, teaching });
    slide("/signup");
  };

  return (
    <div className={cn("dash-night", className)}>
      <form
        ref={ref}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="home-prompt app-prompt group relative w-full rounded-[22px] p-3 text-left"
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
              onType?.(event.target.value.trim().length);
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
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <PromptModeMenu teaching={teaching} onChange={setTeaching} />
            <button type="submit" aria-label="Start building this idea" disabled={!ready} className="app-send h-9 w-9">
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
