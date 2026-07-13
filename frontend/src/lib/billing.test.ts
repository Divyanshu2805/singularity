import { describe, it, expect } from "vitest";
import {
  cardPrice,
  describePlanChange,
  formatResetIn,
  planAction,
  planActionLabel,
  planPriceLabel,
  subscriptionStatusLabel,
  toQuota,
} from "./billing";
import type { Plan, Subscription, UsageToday } from "./types";

const plan = (over: Partial<Plan> = {}): Plan => ({
  id: 1,
  name: "Pro",
  tagline: null,
  maxProjects: 3,
  maxTokensPerDay: 100_000,
  price: "₹499",
  priceAmountMinor: 49_900,
  currency: "inr",
  billingInterval: "month",
  isFree: false,
  ...over,
});

const free = plan({ id: 2, name: "Free", price: "Free", priceAmountMinor: 0, isFree: true, maxProjects: 1, maxTokensPerDay: 5_000 });
const business = plan({ id: 3, name: "Business", price: "₹1499", priceAmountMinor: 149_900 });

const usage = (over: Partial<UsageToday> = {}): UsageToday => ({
  tokensUsed: 0,
  tokensLimit: 5_000,
  previewsRunning: 0,
  previewsLimit: 0,
  projectsUsed: 0,
  projectsLimit: 1,
  resetsAt: "2026-09-16T18:30:00Z",
  planName: "Free",
  ...over,
});

const subscription = (over: Partial<Subscription> = {}): Subscription => ({
  plan: plan(),
  status: "ACTIVE",
  periodEnd: "2026-10-14T00:00:00Z",
  cancelAtPeriodEnd: false,
  isFree: false,
  ...over,
});

describe("toQuota", () => {
  it("reports what's left and how far through the allowance you are", () => {
    const quota = toQuota(usage({ tokensUsed: 1_250, tokensLimit: 5_000 }))!;
    expect(quota).toMatchObject({ used: 1_250, limit: 5_000, remaining: 3_750, percent: 25 });
    expect(quota.isExhausted).toBe(false);
    expect(quota.isLow).toBe(false);
  });

  it("is exhausted once used reaches the limit, not only past it", () => {
    expect(toQuota(usage({ tokensUsed: 5_000, tokensLimit: 5_000 }))!.isExhausted).toBe(true);
    expect(toQuota(usage({ tokensUsed: 4_999, tokensLimit: 5_000 }))!.isExhausted).toBe(false);
  });

  it("clamps an overshoot instead of reporting more than 100%", () => {
    // A single response can cost more than the allowance it started inside - the check is pre-flight.
    const quota = toQuota(usage({ tokensUsed: 32_000, tokensLimit: 5_000 }))!;
    expect(quota.percent).toBe(100);
    expect(quota.remaining).toBe(0);
    expect(quota.isExhausted).toBe(true);
  });

  it("treats a zero limit as full rather than dividing by it", () => {
    const quota = toQuota(usage({ tokensUsed: 0, tokensLimit: 0 }))!;
    expect(quota.percent).toBe(100);
    expect(Number.isNaN(quota.percent)).toBe(false);
    expect(quota.isExhausted).toBe(true);
  });

  it("warns when the allowance is nearly gone, but not before", () => {
    expect(toQuota(usage({ tokensUsed: 4_300, tokensLimit: 5_000 }))!.isLow).toBe(true);
    expect(toQuota(usage({ tokensUsed: 4_200, tokensLimit: 5_000 }))!.isLow).toBe(false);
    // Exhausted is its own state - it shouldn't also read as "running low".
    expect(toQuota(usage({ tokensUsed: 5_000, tokensLimit: 5_000 }))!.isLow).toBe(false);
  });

  it("ignores an unparsable reset time rather than producing an invalid date", () => {
    expect(toQuota(usage({ resetsAt: "not a date" }))!.resetsAt).toBeNull();
  });
});

describe("formatResetIn", () => {
  const now = new Date("2026-09-16T12:00:00Z");

  it("keeps the minutes next to the hours", () => {
    expect(formatResetIn(new Date("2026-09-16T18:12:00Z"), now)).toBe("6h 12m");
  });

  it("drops the minutes when there are none", () => {
    expect(formatResetIn(new Date("2026-09-16T18:00:00Z"), now)).toBe("6h");
  });

  it("reads as minutes only within the hour", () => {
    expect(formatResetIn(new Date("2026-09-16T12:45:00Z"), now)).toBe("45m");
  });

  it("does not count into negative numbers once the reset has passed", () => {
    // The browser's clock can sit behind the server's, and the day rolls over on the server's zone.
    expect(formatResetIn(new Date("2026-09-16T11:00:00Z"), now)).toBe("any moment now");
  });

  it("says something for a missing reset rather than nothing", () => {
    expect(formatResetIn(null, now)).toBe("soon");
    expect(formatResetIn(new Date("2026-09-16T12:00:30Z"), now)).toBe("less than a minute");
  });
});

describe("planAction", () => {
  it("asks an unauthenticated visitor to sign in, whatever the plan", () => {
    expect(planAction(plan(), undefined, false)).toBe("signIn");
    expect(planAction(free, undefined, false)).toBe("signIn");
  });

  it("marks the plan you are already on", () => {
    expect(planAction(plan(), subscription(), true)).toBe("current");
  });

  it("calls a cheaper plan a downgrade even though it sits higher in the list", () => {
    // Compared by price, not by position or id - Business looking at Pro is a step down.
    const onBusiness = subscription({ plan: business });
    expect(planAction(plan(), onBusiness, true)).toBe("downgrade");
    expect(planAction(free, onBusiness, true)).toBe("downgrade");
  });

  it("calls everything paid an upgrade for a free user", () => {
    const onFree = subscription({ plan: free, status: null, isFree: true });
    expect(planAction(plan(), onFree, true)).toBe("upgrade");
    expect(planAction(business, onFree, true)).toBe("upgrade");
    expect(planAction(free, onFree, true)).toBe("current");
  });

  it("labels the button with the plan it would move you to", () => {
    expect(planActionLabel("upgrade", business)).toBe("Upgrade to Business");
    expect(planActionLabel("downgrade", plan())).toBe("Switch to Pro");
    expect(planActionLabel("current", plan())).toBe("Current plan");
    expect(planActionLabel("signIn", free)).toBe("Get started");
  });
});

describe("planAction once a paid plan is cancelling", () => {
  const cancelling = subscription({ plan: business, cancelAtPeriodEnd: true });

  it("offers to keep the plan being cancelled", () => {
    expect(planAction(business, cancelling, true)).toBe("resume");
    expect(planActionLabel("resume", business)).toBe("Keep Business");
  });

  it("shows the free plan as already on its way, not as something to click again", () => {
    expect(planAction(free, cancelling, true)).toBe("scheduled");
    expect(planActionLabel("scheduled", free, cancelling)).toBe("Starts 14 Oct 2026");
  });

  it("still lets them pick a different paid plan instead", () => {
    expect(planAction(plan(), cancelling, true)).toBe("downgrade");
  });
});

describe("describePlanChange", () => {
  const onBusiness = subscription({ plan: business });

  it("says cancelling keeps the plan until the period ends", () => {
    const copy = describePlanChange(onBusiness, free);
    expect(copy.title).toBe("Cancel Business?");
    expect(copy.body[0]).toContain("You'll keep Business until 14 Oct 2026");
    expect(copy.body[0]).toContain("1 project and 5,000 AI tokens a day");
    expect(copy.destructive).toBe(true);
  });

  it("says an upgrade is charged now", () => {
    const copy = describePlanChange(subscription({ plan: plan() }), business);
    expect(copy.title).toBe("Upgrade to Business?");
    expect(copy.body[0]).toContain("charged the difference");
    expect(copy.destructive).toBe(false);
  });

  it("says a downgrade credits the unused time rather than charging", () => {
    const copy = describePlanChange(onBusiness, plan());
    expect(copy.title).toBe("Switch to Pro?");
    expect(copy.body[0]).toContain("credited to your next invoice");
    expect(copy.body.join(" ")).not.toContain("charged");
  });

  it("says keeping a cancelling plan charges nothing", () => {
    const copy = describePlanChange(subscription({ plan: business, cancelAtPeriodEnd: true }), business);
    expect(copy.title).toBe("Keep Business?");
    expect(copy.body.join(" ")).toContain("Nothing is charged now");
  });
});

describe("cardPrice", () => {
  it("shows a free plan as a zero in its currency, not the word Free a second time", () => {
    expect(cardPrice(free)).toBe("₹0");
  });

  it("leaves a paid plan's formatted price alone", () => {
    expect(cardPrice(plan({ price: "₹1,499" }))).toBe("₹1,499");
  });

  it("falls back to the API's wording for a currency it can't format", () => {
    expect(cardPrice({ ...free, currency: "not-a-currency" })).toBe("Free");
  });
});

describe("planPriceLabel", () => {
  it("shows the interval a price recurs on", () => {
    expect(planPriceLabel(plan())).toBe("₹499/month");
  });

  it("leaves a free plan as one word", () => {
    expect(planPriceLabel(free)).toBe("Free");
  });
});

describe("subscriptionStatusLabel", () => {
  it("says when an active subscription renews", () => {
    expect(subscriptionStatusLabel(subscription())).toBe("Renews on 14 Oct 2026");
  });

  it("says a cancelled subscription is ending, not that it is active", () => {
    // It is still ACTIVE until the period ends, so reporting the status alone would tell someone who had
    // just cancelled that nothing had happened.
    expect(subscriptionStatusLabel(subscription({ cancelAtPeriodEnd: true }))).toBe("Cancels on 14 Oct 2026");
  });

  it("asks for action on a failed payment", () => {
    expect(subscriptionStatusLabel(subscription({ status: "PAST_DUE" })))
      .toContain("update your card");
  });

  it("says a free account has no subscription", () => {
    expect(subscriptionStatusLabel(subscription({ isFree: true }))).toBe("No subscription");
    expect(subscriptionStatusLabel(undefined)).toBe("No subscription");
  });
});
