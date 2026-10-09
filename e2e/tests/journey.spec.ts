/**
 * One person's whole path through the product, in a real browser, against the real services.
 *
 * Handles, in order: a visitor who is not signed in being sent to sign in; signing in; describing an idea and
 * answering the interview; the first build arriving and its files being there; the preview coming up and the app
 * that was built actually working - a note typed into it is kept; a change asked for in Teach me mode reaching the
 * running preview without a reload; a step's lesson opening; a marked word opening in the glossary; the project's
 * tour being written, opening a file and being read back; the lesson's task being set and checked; a reload
 * bringing the conversation back from the server; the usage meter having moved; a second person being refused the project; and signing out ending the
 * session on the server, not just in the page.
 *
 * Everything between the browser and the runner pod is real (see e2e/stack.sh for what is and is not). The model is
 * the scripted one, which always builds the same small notes app and then adds a note count to it, so each step can
 * say exactly what it expects to see.
 *
 * The chat draws a build as it streams, before the server has saved it, so "the build is there" is never read off
 * the chat alone: the step waits until the server hands back the file the build wrote.
 *
 * One known gap is allowed for and reported rather than hidden. The scripted model finishes a build in two seconds,
 * so its files arrive while the preview's dev server is still starting, and about one run in ten the frame then
 * shows the template's placeholder or a blank page until it is reloaded (docs/known-gaps). When the built app has
 * not appeared after a minute the step presses the panel's own Reload, as a person would, records that it had to in
 * the timings and as an annotation, and still fails if the app does not appear then.
 *
 * It is one test on purpose: each step stands on the one before, and the order is the product's own. How long the
 * steps that are real work took is written to test-results/journey-timings.json; the times of the two builds are
 * the scripted model's and say nothing about a real one.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stack } from "../playwright.config";
import { aNewPerson, stopwatch, type Person } from "./support";

const IDEA = "A notes app where I can write, search and delete notes";
const NOTE = "Buy oat milk on the way home";

async function signIn(page: Page, person: Person) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill(person.email);
  await page.getByRole("textbox", { name: "Password" }).fill(person.password);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/projects");
}

async function asAnotherPerson<T>(browser: Browser, action: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signIn(page, await aNewPerson());
    return await action(page);
  } finally {
    await context.close();
  }
}

test("a person signs in, builds an app, runs it, learns from it and signs out", async ({ page, browser }, testInfo) => {
  test.skip(stack().ai !== "stub", "The stack is running a real model; the journey expects the scripted one.");

  const timings: Record<string, number> = {};
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const person = await aNewPerson();
  let projectUrl = "";
  let projectId = "";

  await test.step("a visitor who is not signed in is sent to sign in", async () => {
    await page.goto("/projects");
    await page.waitForURL("**/login**");
    expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  });

  await test.step("signing in opens the dashboard", async () => {
    const elapsed = stopwatch();
    await signIn(page, person);
    await expect(page.getByLabel("Describe the project you want to build")).toBeVisible();
    timings.signInMs = elapsed();
    expect((await page.request.get("/api/auth/me")).status()).toBe(200);
  });

  await test.step("an idea is described and the interview answered", async () => {
    await page.getByLabel("Describe the project you want to build").fill(IDEA);
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(page.getByText("Question 1 of 2")).toBeVisible();
    await page.getByRole("group").getByRole("button").first().click();
    await expect(page.getByText("Question 2 of 2")).toBeVisible();
    await page.getByRole("group").getByRole("button").first().click();

    await expect(page.getByRole("heading", { name: "Here’s the plan" })).toBeVisible();
  });

  await test.step("the first build arrives and its files are in the project", async () => {
    const elapsed = stopwatch();
    await page.getByRole("button", { name: "Build it" }).click();
    await page.waitForURL(/\/projects\/\d+$/);
    projectUrl = page.url();
    projectId = projectUrl.split("/").pop()!;
    timings.projectOpenMs = elapsed();

    await expect(page.getByText("4/4", { exact: true })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole("button", { name: /^notes\.ts/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^NoteList\.tsx/ }).first()).toBeVisible();

    const savedPage = async () =>
      (await page.request.get(`/api/projects/${projectId}/files/content?path=${encodeURIComponent("src/pages/Index.tsx")}`)).text();
    await expect.poll(savedPage, { timeout: 120_000 }).toContain("Quick Notes");
    timings.firstBuildStubMs = elapsed();
  });

  const app = page.frameLocator('iframe[title="Live preview"]');

  await test.step("the preview comes up and the app that was built works", async () => {
    const elapsed = stopwatch();
    await page.getByRole("tab", { name: "Preview" }).click();
    const builtApp = app.getByRole("heading", { name: "Quick Notes" });
    const shown = await builtApp.waitFor({ state: "visible", timeout: 60_000 }).then(() => true, () => false);
    if (!shown) {
      timings.previewNeededReload = 1;
      testInfo.annotations.push({ type: "known gap", description: "The preview needed its Reload button: the first build landed while the dev server was starting." });
      await page.getByRole("button", { name: "Reload", exact: true }).click();
      await expect(builtApp).toBeVisible({ timeout: 120_000 });
      const dismiss = page.getByRole("button", { name: "Dismiss" });
      if (await dismiss.isVisible()) await dismiss.click();
    }
    timings.previewVisibleMs = elapsed();
    await expect(page.getByRole("status").filter({ hasText: "Up to date" })).toBeVisible({ timeout: 60_000 });

    await app.getByPlaceholder("Write a note and press Enter").fill(NOTE);
    await app.getByPlaceholder("Write a note and press Enter").press("Enter");
    await expect(app.getByText(NOTE)).toBeVisible();
  });

  await test.step("a change asked for in Teach me mode reaches the running preview without a reload", async () => {
    await expect(app.getByText("1 note", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Mode: Build" }).click();
    await page.getByRole("menuitem", { name: "Teach me" }).click();
    await expect(async () => {
      if (await page.getByRole("menu").isVisible()) await page.getByRole("menu").press("Escape");
      await expect(page.getByRole("button", { name: "Mode: Teach me" })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });

    const elapsed = stopwatch();
    await page.getByRole("textbox", { name: "Message Singularity" }).fill("Show how many notes there are");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("2/2", { exact: true })).toBeVisible({ timeout: 120_000 });
    timings.changeStubMs = elapsed();

    await expect(app.getByText("1 note", { exact: true })).toBeVisible({ timeout: 120_000 });
    timings.changeInPreviewMs = elapsed();
    await expect(app.getByText(NOTE)).toBeVisible();
  });

  await test.step("a step's lesson opens on the lines that step changed", async () => {
    const bigPicture = page.getByRole("button", { name: /^The big picture/ }).last();
    if (await bigPicture.isVisible()) {
      const overview = page.waitForResponse((response) => response.url().includes("/code/overview/stream"));
      await bigPicture.click();
      expect((await overview).status()).toBe(200);
    }
    const steps = page.getByRole("button", { name: /^Build steps/ }).last();
    if (await steps.isVisible()) await steps.click();

    const elapsed = stopwatch();
    await page.getByRole("button", { name: "What this step changed in NoteCount.tsx" }).click();
    await expect(page.getByText("What happens next")).toBeVisible({ timeout: 60_000 });
    timings.lessonStubMs = elapsed();
    await expect(page.getByText("interface NoteCountProps {")).toBeVisible();
  });

  await test.step("a marked word opens in the glossary, which keeps it", async () => {
    const defined = page.waitForResponse((response) => response.url().includes("/code/glossary/stream"));
    await page.getByRole("button", { name: "State", exact: true }).first().click();
    expect((await defined).status()).toBe(200);

    const panel = page.getByRole("dialog", { name: "Learn your project" });
    await expect(panel.getByText("Something a page remembers between clicks")).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByRole("list", { name: "Your words" }).getByRole("button", { name: "State" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  await test.step("the project has a tour that is written once, opens a file, and is read back", async () => {
    const panel = page.getByRole("dialog", { name: "Learn your project" });
    await page.getByRole("button", { name: "Learn your project" }).click();
    await panel.getByRole("tab", { name: "Project tour" }).click();
    await panel.getByRole("button", { name: "Write the tour" }).click();
    await expect(panel.getByText("How a click travels")).toBeVisible({ timeout: 60_000 });
    await panel.getByTitle("Open src/lib/notes.ts").first().click();
    await expect(panel).toBeHidden();

    await page.getByRole("button", { name: "Learn your project" }).click();
    await expect(panel.getByText("How a click travels")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Write the tour" })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  await test.step("a step's lesson sets a task and checks it", async () => {
    await page.getByRole("button", { name: "Give me a task" }).click();
    await expect(page.getByText("Change the heading the page shows to your own name.")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Check my change" }).click();
    await expect(page.getByText("Done.", { exact: true })).toBeVisible({ timeout: 60_000 });
  });

  await test.step("a reload brings the conversation and the lesson back from the server", async () => {
    await page.reload();
    await expect(page.getByText("4/4", { exact: true })).toBeVisible();
    await expect(page.getByText("2/2", { exact: true })).toBeVisible();
    await expect(page.getByText(IDEA).or(page.getByText("A quick notes app")).first()).toBeVisible();
  });

  await test.step("the usage meter has moved", async () => {
    const meter = page.getByRole("button", { name: /of 100,000 AI tokens used today/ });
    await expect(meter).toBeVisible();
    const used = Number(((await meter.getAttribute("aria-label")) ?? (await meter.innerText())).replace(/,/g, "").match(/\d+/)![0]);
    expect(used).toBeGreaterThan(0);
    expect(used).toBeLessThan(100_000);
  });

  await test.step("a second person is refused the project and its files", async () => {
    const answers = await asAnotherPerson(browser, async (other) => ({
      project: (await other.request.get(`/api/projects/${projectId}`)).status(),
      file: (await other.request.get(`/api/projects/${projectId}/files/content?path=${encodeURIComponent("src/pages/Index.tsx")}`)).status(),
      chat: (await other.request.get(`/api/chat/projects/${projectId}`)).status(),
    }));
    for (const [what, status] of Object.entries(answers)) {
      expect([403, 404], `${what} answered ${status} to a stranger`).toContain(status);
    }
  });

  await test.step("the preview is stopped", async () => {
    await page.getByRole("tab", { name: "Preview" }).click();
    await page.getByRole("button", { name: "Stop preview" }).click();
    await expect(page.locator('iframe[title="Live preview"]')).toHaveCount(0, { timeout: 60_000 });
  });

  await test.step("signing out ends the session on the server", async () => {
    await page.goto("/projects");
    await page.getByRole("button", { name: new RegExp(person.email) }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/projects"));
    await expect.poll(async () => (await page.request.get("/api/auth/me")).status(), { timeout: 15_000 }).toBe(401);
    expect((await page.request.get(`/api/projects/${projectId}`)).status()).toBe(401);
  });

  expect(pageErrors, "the page threw while the journey ran").toEqual([]);

  const results = fileURLToPath(new URL("../test-results/", import.meta.url));
  mkdirSync(results, { recursive: true });
  writeFileSync(results + "journey-timings.json", JSON.stringify(timings, null, 2));
  await testInfo.attach("journey-timings", { body: JSON.stringify(timings, null, 2), contentType: "application/json" });
});
