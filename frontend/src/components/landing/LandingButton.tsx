/**
 * The landing page's button: every call to action on the page is one of these, so they all move and answer the same.
 *
 * Handles: the four looks - "primary", a deep-space pill lit gold from its arrow's end, with a bare arrow there;
 * "quiet", the same pill with that light turned well down, for a call to action that sits beside a stronger one
 * without competing with it (the plans' outer cards, where the owner wanted the buttons to match); "solid", a pill
 * filled with violet from edge to edge and matte, made for the recommended plan's card while that card was tinted
 * purple and not used anywhere now - the owner then asked for the plans' buttons to match the rest of the page, so
 * that card carries the primary;
 * and "ghost", a glass pill with a hairline border - in two sizes, optionally full width; how it answers the pointer - the
 * pill and its label hold still, its light fades up with a soft glow tracking the pointer across the face, and the
 * arrow leaves to the right as a new one slides in from the left; and how it answers a press - the arrow shoots out to
 * the right and a fresh one arrives from the left (launchArrow marks the button data-fired for the length of
 * index.css's lux-launch, and settleArrow clears it when that ends, so a quick click still plays it through). The
 * arrow is the only thing that moves: the pill once leant towards the pointer, rose, rolled its label and rippled when
 * pressed, and the owner asked for the label to stay put and the arrow alone to animate. The primary's arrow also sat
 * in a miniature black hole with a turning disk for a while, then in an ink knob on a light violet pill; the owner
 * kept the dark pill's colour and gradient and had the black hole taken out. Nothing runs round its edge or sweeps
 * across it on its own - the light rings and glints it once had were taken off with every other shining border in
 * the app.
 *
 * With "to" it is a link that leaves by the page slide (SlideLink), which is how every sign-up button reaches the
 * sign-in pages; without it, a plain button, or a form's submit button with type="submit" - the sign-in pages' forms
 * are sent with these. "busy" marks it as working: it keeps its full strength while disabled, and "knob" can put a
 * spinner where the arrow was. When its
 * label changes after the first render - sign in becoming create account, or the loading wording - the new label
 * rises into place rather than cutting over. The pointer's position is lib/press.ts writing custom properties, and
 * the looks are index.css's .lux-btn rules, so nothing re-renders while the pointer moves. Under reduced motion the
 * arrow holds still too; the button only lights.
 */
import { useState, type AnimationEvent, type PointerEvent, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { SlideLink } from "@/components/SlideLink";
import { trackPointer } from "@/lib/press";
import { cn } from "@/lib/utils";

const LAUNCH = "lux-launch";

function launchArrow(event: PointerEvent<HTMLElement>) {
  if (event.button > 0) return;
  const node = event.currentTarget;
  node.removeAttribute("data-fired");
  void node.offsetWidth;
  node.setAttribute("data-fired", "");
}

function settleArrow(event: AnimationEvent<HTMLElement>) {
  if (event.animationName === LAUNCH) event.currentTarget.removeAttribute("data-fired");
}

type LandingButtonProps = {
  to?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "quiet" | "solid" | "ghost";
  size?: "sm" | "md";
  block?: boolean;
  arrow?: boolean;
  leading?: ReactNode;
  knob?: ReactNode;
  className?: string;
  children: string;
};

function Arrows() {
  return (
    <>
      <ArrowRight className="lux-arrow" strokeWidth={2.25} />
      <ArrowRight className="lux-arrow lux-arrow-next" strokeWidth={2.25} />
    </>
  );
}

export function LandingButton({
  to,
  type = "button",
  onClick,
  disabled,
  busy,
  variant = "primary",
  size = "md",
  block,
  arrow = true,
  leading,
  knob,
  className,
  children,
  ...rest
}: LandingButtonProps) {
  const [firstLabel] = useState(children);
  const [swapped, setSwapped] = useState(false);
  if (!swapped && children !== firstLabel) setSwapped(true);

  const look = {
    "data-variant": variant,
    "data-size": size,
    "aria-busy": busy || undefined,
    className: cn("lux-btn", block && "w-full", className),
    onPointerEnter: trackPointer,
    onPointerMove: trackPointer,
    onPointerDown: launchArrow,
    onAnimationEnd: settleArrow,
  };

  const face = (
    <>
      <span aria-hidden="true" className="lux-fill" />
      <span aria-hidden="true" className="lux-glow" />
      {leading && (
        <span aria-hidden="true" className="lux-lead">
          {leading}
        </span>
      )}
      <span className="lux-label">
        <span key={children} className="lux-text" data-swap={swapped || undefined}>
          {children}
        </span>
      </span>
      {arrow &&
        (variant === "ghost" ? (
          <span aria-hidden="true" className="lux-arrows">
            <Arrows />
          </span>
        ) : (
          <span aria-hidden="true" className="lux-knob">
            {knob ?? <Arrows />}
          </span>
        ))}
    </>
  );

  if (to) {
    return (
      <SlideLink to={to} {...rest} {...look}>
        {face}
      </SlideLink>
    );
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} {...rest} {...look}>
      {face}
    </button>
  );
}
