/**
 * One person's whole path through the product, in a real browser, against the real services.
 *
 * Handles, in order: a visitor who is not signed in being sent to sign in; signing in; describing an idea and
 * answering the interview; the first build arriving and its files being there; the project being given a title that its
 * header and its sidebar row both read; the preview coming up and the app
 * that was built actually working - a note typed into it is kept; a change asked for in Teach me mode reaching the
 * running preview without a reload; a step's lesson opening; a marked word opening in the glossary; the project's
 * tour being written, opening a file and being read back; the lesson's exercise being answered with code and sent to
 * be checked; a reload
 * bringing the conversation back from the server; the usage meter having moved; the app being published, a visitor
 * with no account opening it at its link, and the link saying so once it is unpublished; a second person being
 * refused the project; and signing out ending the session on the server, not just in the page.
 *
 * Everything between the browser and the runner pod is real (see e2e/stack.sh for what is and is not). The model is
 * the scripted one, which always builds the same small notes app and then adds a note count to it, so each step can
 * say exactly what it expects to see.
 *
 * The chat draws a build as it streams, before the server has saved it, so "the build is there" is never read off
 * the chat alone: the step waits until the server hands back the file the build wrote.
 *
 * The scripted model finishes a build in two seconds, so its files arrive while the preview's dev server is still
 * starting. That used to leave the frame on the template's placeholder or a blank page about one run in ten, and
 * this test pressed the panel's Reload when it met it. The start is ordered on the server now
 * (PreviewBootstrapper), so the step simply expects the built app and fails without it.
 *
 * A write is waited for by its accepted answer, not its first one. Now and then the server refuses a write's CSRF
 * token, and the app's fetch wrapper fetches a fresh token and sends the write again (lib/api.ts); a step that read
 * the first answer failed one run in about fifty on something no person would have seen.
 *
 * It is one test on purpose: each step stands on the one before, and the order is the product's own. How long the
 * steps that are real work took is written to test-results/journey-timings.json; the times of the two builds are
 * the scripted model's and say nothing about a real one.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stack } from "../playwright.config";
import { IDEA, signIn } from "./project";
import { aNewPerson, stopwatch } from "./support";

const STUB_TITLE = "Quick notes you can jot and clear";
const NOTE = "Buy oat milk on the way home";

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

  await test.step("the project is given a title, and the header and its sidebar row read the same one", async () => {
    await expect(page.locator("header").getByText(STUB_TITLE, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: `Actions for ${STUB_TITLE}` }).first()).toBeAttached();
    const project = (await (await page.request.get(`/api/projects/${projectId}`)).json()) as { summary?: string };
    expect(project.summary).toBe(STUB_TITLE);
  });

  const app = page.frameLocator('iframe[title="Live preview"]');

  await test.step("the preview comes up and the app that was built works", async () => {
    const elapsed = stopwatch();
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(app.getByRole("heading", { name: "Quick Notes" })).toBeVisible({ timeout: 60_000 });
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
      const overview = page.waitForResponse((response) => response.url().includes("/code/overview/stream") && response.status() === 200);
      await bigPicture.click();
      await overview;
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
    const defined = page.waitForResponse((response) => response.url().includes("/code/glossary/stream") && response.status() === 200);
    await page.getByRole("button", { name: "State", exact: true }).first().click();
    await defined;

    const panel = page.getByRole("dialog", { name: "Learn your project" });
    await expect(panel.getByText("Something a page remembers between clicks")).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByRole("list", { name: "Your words" }).getByRole("button", { name: "State", exact: true })).toBeVisible();
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

  await test.step("a step's lesson ends with an exercise, and the code written for it is sent to be checked", async () => {
    await expect(page.getByText("Try changing this")).toHaveCount(0);
    const exercise = page.getByLabel(/Write the first line again yourself/);
    await exercise.fill('import { useState } from "react";\nexport const file = "notes.ts";');
    const asked = page.waitForResponse((response) => response.url().includes("/code/ask") && response.status() === 200);
    await exercise.press("Control+Enter");
    await asked;
    await expect(page.getByText(/This is the stub model's answer/).first()).toBeVisible({ timeout: 60_000 });
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

  await test.step("the app is published, a visitor opens it at its link, and the link says so once it is unpublished", async () => {
    const elapsed = stopwatch();
    await page.getByRole("button", { name: /^Publish\./ }).click();
    await page.getByRole("textbox", { name: "Link name" }).fill(`journey-${Date.now().toString(36)}`);
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    const link = page.getByRole("link", { name: "Open the app in a new tab" });
    await expect(link).toBeVisible({ timeout: 300_000 });
    timings.publishMs = elapsed();
    const address = (await link.getAttribute("href"))!;

    const visitor = await browser.newContext();
    try {
      const visit = await visitor.newPage();
      await visit.goto(address);
      await expect(visit.getByRole("heading", { name: "Quick Notes" })).toBeVisible();
      expect((await visit.goto(new URL("/a/page/of/the/app", address).href))?.status()).toBe(200);
      await expect(visit.locator("#root")).not.toBeEmpty();

      await page.getByRole("button", { name: "Unpublish", exact: true }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Unpublish", exact: true }).click();
      await expect(link).toHaveCount(0, { timeout: 60_000 });
      await expect.poll(async () => (await visit.goto(address))?.status(), { timeout: 60_000 }).toBe(404);
    } finally {
      await visitor.close();
    }
    await page.keyboard.press("Escape");
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
