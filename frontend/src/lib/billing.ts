/**
 * The arithmetic and wording behind every quota meter, banner and plan card.
 *
 * Handles: turning today's usage into a quota with a clamped percentage and low and exhausted flags, formatting a
 * countdown to the refill, formatting prices and token counts, deciding whether a plan is an upgrade, a downgrade,
 * the current one or a cancellation, and the copy for confirming any of those.
 *
 * Kept pure and out of the components so it can be tested without rendering: the parts that are easy to get subtly
 * wrong - a percentage that divides by zero, a countdown that rounds 59 minutes to zero hours, a comparison that
 * calls an equal plan an upgrade - are exactly the parts a component test would not catch.
 */
import type { Plan, Subscription, UsageToday } from "./types";

export const LOW_QUOTA_THRESHOLD = 0.85;

export interface Quota {
  used: number;
  limit: number;
  remaining: number;
  percent: number;
  isExhausted: boolean;
  isLow: boolean;
  resetsAt: Date | null;
}

export function toQuota(usage: UsageToday | undefined): Quota | null {
  if (!usage) return null;

  const limit = Math.max(0, usage.tokensLimit ?? 0);
  const used = Math.max(0, usage.tokensUsed ?? 0);
  const remaining = Math.max(0, limit - used);
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

export const formatTokens = (value: number) => value.toLocaleString();

export function cardPrice(plan: Plan): string {
  if (!plan.isFree) return plan.price;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: (plan.currency ?? "inr").toUpperCase(),
      maximumFractionDigits: 0,
    }).format(0);
  } catch {
    return plan.price;
  }
}

export function planPriceLabel(plan: Plan): string {
  if (plan.isFree || !plan.priceAmountMinor) return plan.price;
  return plan.billingInterval ? `${plan.price}/${plan.billingInterval}` : plan.price;
}

export type PlanAction = "current" | "upgrade" | "downgrade" | "signIn" | "resume" | "scheduled";

export const hasPaidSubscription = (subscription: Subscription | undefined) =>
  !!subscription && !subscription.isFree;

export function planAction(plan: Plan, current: Subscription | undefined, isSignedIn: boolean): PlanAction {
  if (!isSignedIn) return "signIn";
  if (!current) return plan.isFree ? "current" : "upgrade";

  if (hasPaidSubscription(current) && current.cancelAtPeriodEnd) {
    if (current.plan?.id != null && plan.id === current.plan.id) return "resume";
    if (plan.isFree) return "scheduled";
  }

  if (current.plan?.id != null && plan.id === current.plan.id) return "current";
  const currentAmount = current.plan?.priceAmountMinor ?? 0;
  const planAmount = plan.priceAmountMinor ?? 0;
  if (planAmount === currentAmount) return "current";
  return planAmount > currentAmount ? "upgrade" : "downgrade";
}

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

export interface PlanChangeCopy {
  title: string;
  body: string[];
  confirmLabel: string;
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

export function formatBillingDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export const needsAttention = (subscription: Subscription | undefined) =>
  subscription?.status === "PAST_DUE" || subscription?.status === "INCOMPLETE";
