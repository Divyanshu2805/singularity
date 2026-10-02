/**
 * The button, in this app's variants and sizes.
 *
 * Handles: the visual variants, the sizes, and rendering as a different element when a link or another component
 * needs to look like a button.
 *
 * Every button in the app is a pill from one family (index.css, .btn-primary/.btn-danger/.btn-glass/.btn-soft/
 * .btn-ghost), and every one answers the pointer the same way - it darkens a little and a soft gold light comes up
 * under the pointer itself, following it across (index.css, the buttons' light; lib/button-light.ts) - on a layer
 * under the label, so it fades rather than snaps. The dashboard's quick-start chips and the chat's suggestion cards
 * (.idea-chip, .prompt-card) take the same light. The
 * primary is a dark pill lit from below by a gold light - a gold-to-orange fill, a pale pearl one, and an eclipse's
 * rim and spark drawn inside the pill were each turned down before it; the destructive is a red fill whose light is
 * red; the
 * outline is a matte warm charcoal surface a step lighter than the panel it sits on, with a hairline that turns gold;
 * secondary is a softer fill and ghost is bare until hovered. The primary used to be the landing button's deep-space
 * pill lit violet from its right end; the owner did not want that look inside the app, and the outline it sat beside
 * was too dark to read as a button and had no hover of its own. All press in slightly when clicked and take a calm
 * gold ring for keyboard focus. Their icons answer the pointer too (index.css, .btn svg): a small grow by default,
 * or whatever motion the caller sets through --icon-hover (an arrow nudging along, a refresh turning).
 */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold tracking-[-0.01em] transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/35 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "btn-primary",
        destructive: "btn-danger",
        outline: "btn-glass",
        secondary: "btn-soft",
        ghost: "btn-ghost font-medium text-foreground/85 hover:text-foreground",
        link: "font-medium text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 px-4",
        lg: "h-11 px-7",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
