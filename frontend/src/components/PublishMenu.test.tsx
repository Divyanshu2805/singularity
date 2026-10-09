/**
 * Covers the Publish panel: that only the owner is offered controls, that each state of a published app says the right
 * thing and offers the right action, that the link name is checked before anything is sent, that a plan with no room
 * answers with the upgrade dialog rather than an error, and that the build's output is fetched only when asked for.
 *
 * The server is mocked at the api module; what is under test is what the person sees and which calls a press makes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    getPublish: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
    setCodeShared: vi.fn(),
    getPublishLog: vi.fn(),
  },
}));

import { api, ApiRequestError } from "@/lib/api";
import { PublishMenu } from "./PublishMenu";
import type { PublishState } from "@/lib/types";

const never: PublishState = {
  live: false, url: null, slug: null, suggestedSlug: "my-app-ab12", publishedAt: null, hasChanges: false, shared: false, build: null,
};
const live: PublishState = {
  ...never, live: true, url: "http://my-app-ab12.localhost:8090/", slug: "my-app-ab12", suggestedSlug: null, publishedAt: "2026-10-08T10:00:00Z",
};

function renderMenu(state: PublishState, role = "OWNER") {
  vi.mocked(api.getPublish).mockResolvedValue(state);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PublishMenu projectId="7" role={role} projectName="My app" />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return client;
}

async function open() {
  await waitFor(() => expect(api.getPublish).toHaveBeenCalled());
  fireEvent.click(await screen.findByRole("button", { name: /^Publish/ }));
}

describe("PublishMenu", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers the owner a Publish button with a link name, and says that anyone with the link can open what it publishes", async () => {
    renderMenu(never);
    await open();

    expect(await screen.findByLabelText(/Link name/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publish" })).toBeTruthy();
    expect(screen.getByText(/Anyone with the link can open it/)).toBeTruthy();
  });

  it("starts a build with the chosen name, and nothing is sent before the press", async () => {
    vi.mocked(api.publish).mockResolvedValue({ ...never, slug: "my-cool-app", build: { status: "BUILDING", step: "Collecting your files", startedAt: null, failureKind: null, failureMessage: null } });
    renderMenu(never);
    await open();
    expect(api.publish).not.toHaveBeenCalled();

    fireEvent.change(await screen.findByLabelText(/Link name/), { target: { value: "my-cool-app" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(api.publish).toHaveBeenCalledWith("7", "my-cool-app"));
  });

  it("refuses a link name the server would refuse, before sending it", async () => {
    renderMenu(never);
    await open();

    fireEvent.change(await screen.findByLabelText(/Link name/), { target: { value: "www" } });

    expect(await screen.findByText("That name isn't available.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the build's steps while it runs", async () => {
    renderMenu({ ...never, slug: "my-app-ab12", build: { status: "BUILDING", step: "Installing packages", startedAt: null, failureKind: null, failureMessage: null } });
    await open();

    const steps = await screen.findByRole("list", { name: "Publishing steps" });
    expect(steps.querySelector('[aria-current="step"]')?.textContent).toContain("Installing packages");
  });

  it("shows a live app's link with copy and open, and no Update while nothing has changed", async () => {
    renderMenu(live);
    await open();

    expect(await screen.findByText("my-app-ab12.localhost:8090")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy the link" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the app in a new tab" }).getAttribute("href")).toBe(live.url);
    expect(screen.queryByRole("button", { name: "Update" })).toBeNull();
  });

  it("says there are changes not published, and Update starts a build", async () => {
    vi.mocked(api.publish).mockResolvedValue({ ...live, hasChanges: true });
    renderMenu({ ...live, hasChanges: true });
    fireEvent.click(await screen.findByRole("button", { name: /^Publish/ }));

    expect(await screen.findByText("You have changes that are not published")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => expect(api.publish).toHaveBeenCalledWith("7", undefined));
  });

  it("explains a failed build in plain words and fetches its output only when asked", async () => {
    vi.mocked(api.getPublishLog).mockResolvedValue("Rollup failed to resolve import");
    renderMenu({
      ...live,
      build: { status: "FAILED", step: null, startedAt: null, failureKind: "BUILD", failureMessage: "A file has an error in src/App.tsx" },
    });
    await open();

    expect(await screen.findByText(/The update failed/)).toBeTruthy();
    expect(screen.getByText(/unchanged/)).toBeTruthy();
    expect(api.getPublishLog).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Show output/ }));
    expect(await screen.findByText("Rollup failed to resolve import")).toBeTruthy();
    expect(api.getPublishLog).toHaveBeenCalledWith("7");
  });

  it("switches the sharing of the code, and unpublishing asks first", async () => {
    vi.mocked(api.setCodeShared).mockResolvedValue({ ...live, shared: true });
    vi.mocked(api.unpublish).mockResolvedValue();
    renderMenu(live);
    await open();

    fireEvent.click(await screen.findByLabelText(/Share the code/));
    await waitFor(() => expect(api.setCodeShared).toHaveBeenCalledWith("7", true));

    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    expect(api.unpublish).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Unpublish", hidden: false }));
  });

  it("gives a plan with no room the upgrade dialog, not an error", async () => {
    vi.mocked(api.publish).mockRejectedValue(
      new ApiRequestError("full", 402, { reason: "PUBLISH_LIMIT", limit: 1, used: 1, resetsAt: null, planName: "Free" })
    );
    renderMenu(never);
    await open();

    fireEvent.click(await screen.findByRole("button", { name: "Publish" }));

    expect(await screen.findByText(/The Free plan includes 1 published app/)).toBeTruthy();
  });

  it("shows everyone else where it stands, and no controls", async () => {
    renderMenu(live, "VIEWER");
    await open();

    expect(await screen.findByText("my-app-ab12.localhost:8090")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Unpublish" })).toBeNull();
    expect(screen.queryByLabelText(/Share the code/)).toBeNull();
  });

  it("tells a non-owner an app that is not published is the owner's to publish", async () => {
    renderMenu(never, "EDITOR");
    await open();

    expect(await screen.findByText(/Only the project's owner can publish it/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
  });
});
