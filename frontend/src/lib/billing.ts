import type { Plan, Subscription, UsageToday } from "./types";

/**
 * The arithmetic and wording behind every quota meter, banner and plan card.
 *
 * <p>Kept pure and out of the components so it can be tested without rendering anything - the parts that are
 * easy to get subtly wrong (a percentage that divides by zero, a countdown that rounds 59 minutes to "0h", a
 * plan comparison that calls an equal plan an upgrade) are exactly the parts a component test wouldn't catch.
 */

/** Below this much of the allowance left, the UI starts warning rather than just reporting. */
export const LOW_QUOTA_THRESHOLD = 0.85;

export interface Quota {
  used: number;
  limit: number;
  remaining: number;
  /** 0-100, clamped. A limit of zero reads as fully used rather than as NaN. */
  percent: number;
  /** True once nothing is left - the point at which sending is refused. */
  isExhausted: boolean;
  /** True while there is still something left, but not much. */
  isLow: boolean;
  resetsAt: Date | null;
}

export function toQuota(usage: UsageToday | undefined): Quota | null {
  if (!usage) return null;

  const limit = Math.max(0, usage.tokensLimit ?? 0);
  const used = Math.max(0, usage.tokensUsed ?? 0);
  const remaining = Math.max(0, limit - used);
  // A zero limit is "nothing allowed", not "divide by zero" - it must read as full, not as NaN.
  const percent = limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  const resetsAt = usage.resetsAt ? new Date(usage.resetsAt) : null;

  return {
    used,
    limit,
    remaining,
    percent,
    isExhausted: used >= limit,
    isLow: used < limit && used / limit >= LOW_QUOTA_THRESHOLD,
    resetsAt: resetsAt && !Number.isNaN(resetsAt.getTime()) ? resetsAt : null,
  };
}

/**
 * "6h 12m", "12m", "less than a minute" - how long until the allowance refills.
 *
 * <p>Minutes are kept alongside hours because "6h" alone reads as a rounded guess when someone is waiting on
 * it, and a reset that has already passed says so rather than counting into negative numbers (the client's
 * clock can be behind the server's, and the day rolls over on the server's zone, not the browser's).
 */
export function formatResetIn(resetsAt: Date | null, now: Date = new Date()): string {
  if (!resetsAt) return "soon";

  const ms = resetsAt.getTime() - now.getTime();
  if (ms <= 0) return "any moment now";

  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return "less than a minute";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** "5,000" - thousands separated, because a bare 100000 is hard to read at a glance. */
export const formatTokens = (value: number) => value.toLocaleString();

/**
 * The big number on a plan card. A free plan shows as a zero amount in its own currency ("₹0") rather than
 * the API's "Free": the card is already headed "Free", so repeating the word read as "Free / Free", and a zero
 * lines the free card up with the paid ones the way Claude's and ChatGPT's pricing pages do.
 */
export function cardPrice(plan: Plan): string {
  if (!plan.isFree) return plan.price;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: (plan.currency ?? "inr").toUpperCase(),
      maximumFractionDigits: 0,
    }).format(0);
  } catch {
    // An unknown currency code throws - fall back to what the API said rather than breaking the page.
    return plan.price;
  }
}

/** What a plan costs, per interval: "₹499/month", or just "Free". */
export function planPriceLabel(plan: Plan): string {
  if (plan.isFree || !plan.priceAmountMinor) return plan.price;
  return plan.billingInterval ? `${plan.price}/${plan.billingInterval}` : plan.price;
}

/**
 * How a plan card's button should read, given what the viewer is already on.
 *
 * <p>Compared by price rather than by id or position: ids are insertion order and say nothing about which
 * plan is bigger, and someone on Business looking at Pro is downgrading even though Pro sits above them in
 * the list.
 */
export type PlanAction = "current" | "upgrade" | "downgrade" | "signIn" | "resume" | "scheduled";

/** True for someone paying for a plan right now - the case where switching changes a live subscription. */
export const hasPaidSubscription = (subscription: Subscription | undefined) =>
  !!subscription && !subscription.isFree;

export function planAction(plan: Plan, current: Subscription | undefined, isSignedIn: boolean): PlanAction {
  if (!isSignedIn) return "signIn";
  if (!current) return plan.isFree ? "current" : "upgrade";

  // Once a paid plan is set to cancel, the two cards that matter change meaning: their own plan becomes the
  // way to change their mind, and the free plan is already on its way rather than something to click again.
  if (hasPaidSubscription(current) && current.cancelAtPeriodEnd) {
    if (current.plan?.id != null && plan.id === current.plan.id) return "resume";
    if (plan.isFree) return "scheduled";
  }

  if (current.plan?.id != null && plan.id === current.plan.id) return "current";
  // A free viewer has no paid plan to compare against, so everything paid is a step up.
  const currentAmount = current.plan?.priceAmountMinor ?? 0;
  const planAmount = plan.priceAmountMinor ?? 0;
  if (planAmount === currentAmount) return "current";
  return planAmount > currentAmount ? "upgrade" : "downgrade";
}

/** The words on that button. */
export function planActionLabel(action: PlanAction, plan: Plan, current?: Subscription): string {
  switch (action) {
    case "current":
      return "Current plan";
    case "resume":
      return `Keep ${plan.name}`;
    case "scheduled":
      return current?.periodEnd ? `Starts ${formatBillingDate(current.periodEnd)}` : "Starts at renewal";
    case "signIn":
      return plan.isFree ? "Get started" : `Sign in to choose ${plan.name}`;
    case "downgrade":
      return `Switch to ${plan.name}`;
    default:
      return plan.isFree ? "Get started" : `Upgrade to ${plan.name}`;
  }
}

/**
 * What confirming a plan change will actually do, spelled out before it happens.
 *
 * <p>Every one of these moves money or takes something away, so none of them happens on a single click, and the
 * dialog says the two things people most want to know: when it takes effect, and what it costs or what they
 * lose. The wording has to match what the backend really does - cancelling keeps the plan until the period
 * ends, an upgrade is charged the prorated difference now, a downgrade is credited to the next invoice - or the
 * confirmation is a promise the product then breaks.
 */
export interface PlanChangeCopy {
  title: string;
  body: string[];
  confirmLabel: string;
  /** Cancelling reads as a loss, so it's styled as one; everything else is a normal confirmation. */
  destructive: boolean;
}

export function describePlanChange(current: Subscription, target: Plan): PlanChangeCopy {
  const from = current.plan;
  const ends = current.periodEnd ? formatBillingDate(current.periodEnd) : null;
  const limits = `${formatTokens(target.maxProjects ?? 0)} ${target.maxProjects === 1 ? "project" : "projects"} and ${formatTokens(target.maxTokensPerDay ?? 0)} AI tokens a day`;

  if (target.id === from.id && current.cancelAtPeriodEnd) {
    return {
      title: `Keep ${from.name}?`,
      body: [ends ? `Your subscription will renew on ${ends} as usual.` : "Your subscription will carry on renewing as usual.",
             "Nothing is charged now."],
      confirmLabel: `Keep ${from.name}`,
      destructive: false,
    };
  }

  if (target.isFree) {
    return {
      title: `Cancel ${from.name}?`,
      body: [
        ends
          ? `You'll keep ${from.name} until ${ends}. After that you move to the free plan, with ${limits}.`
          : `You'll keep ${from.name} until the end of this billing period, then move to the free plan, with ${limits}.`,
        "Nothing is refunded for the time left, and you can change your mind any time before then.",
        "If you have more projects than the free plan allows, they stay - you just can't create new ones.",
      ],
      confirmLabel: "Cancel subscription",
      destructive: true,
    };
  }

  const isUpgrade = (target.priceAmountMinor ?? 0) > (from.priceAmountMinor ?? 0);
  return isUpgrade
    ? {
        title: `Upgrade to ${target.name}?`,
        body: [
          `${target.name} is ${planPriceLabel(target)}. You'll be charged the difference for the rest of this billing period now, and ${planPriceLabel(target)} from your next renewal.`,
          `Your limits go up straight away: ${limits}.`,
        ],
        confirmLabel: `Upgrade to ${target.name}`,
        destructive: false,
      }
    : {
        title: `Switch to ${target.name}?`,
        body: [
          `${target.name} is ${planPriceLabel(target)}. The switch happens now, and the unused part of ${from.name} is credited to your next invoice.`,
          `Your limits change straight away to ${limits}. If you have more projects than that, they stay - you just can't create new ones.`,
        ],
        confirmLabel: `Switch to ${target.name}`,
        destructive: false,
      };
}

/**
 * The line under a subscription's name: what state it's in, in words rather than an enum.
 *
 * <p>A cancelled-but-still-running subscription is the case worth getting right - it is still `ACTIVE`, so
 * reporting the status alone would tell someone who just cancelled that nothing had happened.
 */
export function subscriptionStatusLabel(subscription: Subscription | undefined): string {
  if (!subscription || subscription.isFree) return "No subscription";

  const ends = subscription.periodEnd ? formatBillingDate(subscription.periodEnd) : null;

  if (subscription.cancelAtPeriodEnd) return ends ? `Cancels on ${ends}` : "Cancels at the end of this period";

  switch (subscription.status) {
    case "PAST_DUE":
      return "Payment failed - update your card to keep your plan";
    case "TRIALING":
      return ends ? `Trial ends ${ends}` : "Trialing";
    case "CANCELED":
      return "Cancelled";
    case "INCOMPLETE":
      return "Waiting for payment to complete";
    default:
      return ends ? `Renews on ${ends}` : "Active";
  }
}

/** "14 Oct 2026" - unambiguous about the month, which a numeric date isn't across locales. */
export function formatBillingDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** True when the subscription needs the user to do something - shown as a warning, not a badge. */
export const needsAttention = (subscription: Subscription | undefined) =>
  subscription?.status === "PAST_DUE" || subscription?.status === "INCOMPLETE";
