import { describe, expect, it } from "vitest";
import {
  PUBLISH_STEPS,
  buttonLabel,
  canPublish,
  failureAdvice,
  headline,
  isRetryableAsIs,
  linkLabel,
  publishPhase,
  publishPollInterval,
  sharePath,
  shareUrl,
  slugProblem,
  stepProgress,
} from "./publish";
import type { PublishState } from "./types";

const base: PublishState = {
  live: false, url: null, slug: null, suggestedSlug: "my-app-ab12", publishedAt: null, hasChanges: false, shared: false, build: null,
};
const live: PublishState = { ...base, live: true, url: "http://a.localhost:8090/", slug: "a-b12", suggestedSlug: null, publishedAt: "2026-10-08T10:00:00Z" };
const building = { status: "BUILDING" as const, step: "Installing packages", startedAt: "2026-10-08T10:00:00Z", failureKind: null, failureMessage: null };
const failed = { status: "FAILED" as const, step: null, startedAt: null, failureKind: "BUILD" as const, failureMessage: "A file has an error in src/App.tsx" };

describe("who can publish", () => {
  it("is the owner alone", () => {
    expect(canPublish("OWNER")).toBe(true);
    expect(canPublish("EDITOR")).toBe(false);
    expect(canPublish("VIEWER")).toBe(false);
    expect(canPublish(undefined)).toBe(false);
  });
});

describe("the phase of a publish", () => {
  it("tells the seven states apart", () => {
    expect(publishPhase(undefined)).toBe("never");
    expect(publishPhase(base)).toBe("never");
    expect(publishPhase({ ...base, slug: "a-b12" })).toBe("unpublished");
    expect(publishPhase({ ...base, slug: "a-b12", build: building })).toBe("building");
    expect(publishPhase({ ...base, slug: "a-b12", build: failed })).toBe("failed");
    expect(publishPhase(live)).toBe("live");
    expect(publishPhase({ ...live, build: building })).toBe("live-building");
    expect(publishPhase({ ...live, build: failed })).toBe("live-failed");
  });
});

describe("the headline", () => {
  it("offers the update when the project has moved since", () => {
    expect(headline({ ...live, hasChanges: true }).title).toBe("You have changes that are not published");
    expect(headline({ ...live, hasChanges: true }).tone).toBe("warn");
    expect(headline(live).title).toBe("Published");
  });

  it("says the live app is unchanged when an update fails", () => {
    const text = headline({ ...live, build: failed });
    expect(text.tone).toBe("bad");
    expect(text.detail).toContain("src/App.tsx");
    expect(text.detail).toContain("unchanged");
  });

  it("shows the step while a build runs", () => {
    expect(headline({ ...base, slug: "a-b12", build: building })).toMatchObject({ title: "Publishing", detail: "Installing packages" });
    expect(headline({ ...live, build: building })).toMatchObject({ title: "Updating", detail: "Installing packages" });
  });

  it("keeps the link for an unpublished project", () => {
    expect(headline({ ...base, slug: "a-b12" }).detail).toContain("link is kept");
  });
});

describe("the button", () => {
  it("reads Publish, Publishing, Published or Update", () => {
    expect(buttonLabel(base)).toBe("Publish");
    expect(buttonLabel({ ...base, slug: "a-b12", build: building })).toBe("Publishing");
    expect(buttonLabel(live)).toBe("Published");
    expect(buttonLabel({ ...live, hasChanges: true })).toBe("Update");
    expect(buttonLabel({ ...live, build: building })).toBe("Publishing");
    expect(buttonLabel(undefined)).toBe("Publish");
  });
});

describe("polling", () => {
  it("is quick while a build runs, slow when live, and stops when there is nothing to watch", () => {
    expect(publishPollInterval({ ...base, build: building }, false)).toBe(1500);
    expect(publishPollInterval(live, false)).toBe(30_000);
    expect(publishPollInterval(base, false)).toBe(false);
    expect(publishPollInterval(live, true)).toBe(10_000);
  });
});

describe("the steps", () => {
  it("knows where the current one is in the list", () => {
    expect(stepProgress("Installing packages")).toEqual({ index: 3, total: PUBLISH_STEPS.length });
    expect(stepProgress("Something new")).toEqual({ index: -1, total: PUBLISH_STEPS.length });
    expect(stepProgress(null).index).toBe(-1);
  });

  it("matches the server's step names", () => {
    expect(PUBLISH_STEPS[0]).toBe("Collecting your files");
    expect(PUBLISH_STEPS[PUBLISH_STEPS.length - 1]).toBe("Putting it online");
  });
});

describe("failure advice", () => {
  it("blames the app only when it is the app's fault", () => {
    expect(isRetryableAsIs("PLATFORM")).toBe(true);
    expect(isRetryableAsIs("CAPACITY")).toBe(true);
    expect(isRetryableAsIs("BUILD")).toBe(false);
    expect(failureAdvice("PLATFORM")).toContain("not your app's fault");
    expect(failureAdvice("BUILD")).toContain("chat");
    expect(failureAdvice("NO_OUTPUT")).toContain("dist");
    expect(failureAdvice(null)).toBe("Try again.");
  });
});

describe("link names", () => {
  it("accepts an empty field - the server then makes one - and ordinary names", () => {
    expect(slugProblem("")).toBeNull();
    expect(slugProblem("   ")).toBeNull();
    expect(slugProblem("my-todo-app")).toBeNull();
    expect(slugProblem("  My-App-1 ")).toBeNull();
    expect(slugProblem("x".repeat(40))).toBeNull();
  });

  it("refuses what the server refuses", () => {
    for (const bad of ["ab", "x".repeat(41), "-abc", "abc-", "a--b", "has space", "under_score", "dot.ted", "ünï"]) {
      expect(slugProblem(bad), bad).not.toBeNull();
    }
    for (const reserved of ["www", "api", "singularity", "WWW", "login"]) {
      expect(slugProblem(reserved), reserved).toBe("That name isn't available.");
    }
    expect(slugProblem("p12-abcdefghij")).toBe("That name isn't available.");
  });
});

describe("addresses", () => {
  it("shows a link without its scheme", () => {
    expect(linkLabel("https://my-app-ab12.example.dev/")).toBe("my-app-ab12.example.dev");
    expect(linkLabel("http://a.localhost:8090/")).toBe("a.localhost:8090");
    expect(linkLabel(null)).toBe("");
  });

  it("builds the share page's address", () => {
    expect(sharePath("my-app-ab12")).toBe("/p/my-app-ab12");
    expect(shareUrl("https://app.example.dev", "my-app-ab12")).toBe("https://app.example.dev/p/my-app-ab12");
  });
});
