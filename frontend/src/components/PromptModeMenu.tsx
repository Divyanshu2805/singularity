/**
 * The mode picker on the home prompt.
 *
 * Handles: choosing how the next message is built from a small menu - Build (just the change) or Teach me (each
 * step of that build can be opened for a plain-English lesson on what it changed). The choice applies to messages
 * sent while it is in force and stays with them: turns built before it was switched on do not gain lessons, and
 * turns built with it keep theirs after it is switched off. Each option's explanation appears only as a hover
 * tooltip. The trigger names the mode in force, so it is never a guess what a build will do; the choice is the
 * teaching-mode flag (hooks/use-teaching-mode.ts), so it still resets on sign-out.
 *
 * While Teach me is the mode in force, the menu also asks who the explanations are for - new to code, coded a
 * little, or a developer (lib/learner-level.ts). It is shown only then, at the owner's request: in Build mode it is a
 * question about something that is not happening. It is remembered for the person, and it shapes every lesson, big
 * picture and ExplainLLM answer asked for afterwards. Choosing Teach me leaves the menu open so the question appears
 * under the pointer, and so does choosing a level, since it is a setting beside the choice and not the choice itself.
 *
 * It is dressed as the rest of the app's menus are rather than in colours of its own: the trigger is the app's chip
 * (index.css, .app-chip - a dark charcoal pill that takes the gold wash and a gold hairline under the pointer and
 * while the menu is open, its chevron turning over), and the list is the shared raised menu surface. It had a brassy
 * border, a brown body and a shadow left over from the violet palette, which showed as a blue haze beside it.
 * Hovering is the sidebar's wash, as in every menu (index.css, the shared .app-menu rules): one gold wash glides from
 * option to option (lib/menu-glide) and the icon of the option under it turns gold; the option itself holds still. The
 * mode in force (data-current) is marked in gold - its icon and its tick, which holds still under the pointer - so
 * the choice reads without hovering.
 */
import { Check, ChevronDown, GraduationCap, Hammer } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LEARNER_LEVELS, useLearnerLevel } from "@/lib/learner-level";

interface PromptModeMenuProps {
  teaching: boolean;
  onChange: (teaching: boolean) => void;
}

const MODES = [
  { teaching: false, label: "Build", hint: "Just build the project.", Icon: Hammer },
  { teaching: true, label: "Teach me", hint: "The build opens with the big picture, and each step can explain what it changed.", Icon: GraduationCap },
];

export function PromptModeMenu({ teaching, onChange }: PromptModeMenuProps) {
  const current = MODES.find((mode) => mode.teaching === teaching) ?? MODES[0];
  const [level, setLevel] = useLearnerLevel();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Mode: ${current.label}`}
          className="app-chip mode-trigger inline-flex h-9 shrink-0 items-center gap-2 px-3.5 text-[13px] font-medium"
        >
          <current.Icon className="h-4 w-4" />
          {current.label}
          <ChevronDown className="mode-chevron no-icon-anim h-3.5 w-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" sideOffset={8} className="w-52 rounded-2xl p-1.5">
        {MODES.map(({ teaching: value, label, hint, Icon }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <DropdownMenuItem
                onSelect={(event) => {
                  if (value && !teaching) event.preventDefault();
                  onChange(value);
                }}
                data-current={value === teaching}
                className="gap-2.5 rounded-xl px-3 py-2 text-sm font-medium"
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{label}</span>
                {value === teaching && <Check className="no-icon-anim h-4 w-4" />}
              </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10} className="app-menu-raised max-w-[220px] rounded-xl px-3 py-2 text-xs leading-5 text-[hsl(40_30%_92%)]">
              {hint}
            </TooltipContent>
          </Tooltip>
        ))}
        {teaching && <DropdownMenuSeparator className="my-1.5" />}
        {teaching && <DropdownMenuLabel className="px-3 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          Explain it for
        </DropdownMenuLabel>}
        {teaching && LEARNER_LEVELS.map(({ value, label, hint }) => (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <DropdownMenuItem
                role="menuitemradio"
                aria-checked={value === level}
                onSelect={(event) => {
                  event.preventDefault();
                  setLevel(value);
                }}
                data-current={value === level}
                className="gap-2.5 rounded-xl px-3 py-1.5 text-[13px]"
              >
                <span className="flex-1">{label}</span>
                {value === level && <Check className="no-icon-anim h-3.5 w-3.5" />}
              </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10} className="app-menu-raised max-w-[220px] rounded-xl px-3 py-2 text-xs leading-5 text-[hsl(40_30%_92%)]">
              {hint}
            </TooltipContent>
          </Tooltip>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
