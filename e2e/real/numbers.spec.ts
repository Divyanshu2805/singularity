/**
 * Times the product's main steps as a person meets them, in a real browser, with the configured AI model.
 *
 * Handles: one pass through the same path as the journey test - idea, interview, first build, preview, a change in
 * Teach me mode, one lesson - recording how long each step took from the press that started it, and what the AI
 * calls cost in tokens, to test-results/numbers.json.
 *
 * It is a measurement, not a test of behaviour: it expects only what any model's answer has - a build that saves, a
 * page that renders, a lesson that arrives - and it spends tokens, so nothing runs it by itself. Start the stack
 * with a real model and run it by name:
 *   e2e/stack.sh up --context kind-<cluster> --real-ai <env file>
 *   (cd e2e && npm run numbers)
 *
 * A turn counts as saved when the server's own history has it, asked every quarter of a second - the chat lets go of
 * its stream the moment it reads `done`, and a request the page abandoned never reports as finished, which hung the
 * first version of this. So "build" here is press to saved, not press to the last word. One pass is one sample: read
 * the numbers beside the build benchmark's medians, not instead of them. A lesson is complete when its usage is
 * metered, which the server does as the stream ends.
 */
import { expect, test, type Page, type Response } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stack } from "../playwright.config";
import { aNewPerson, stopwatch } from "../tests/support";

const IDEA = "A todo list where I can add tasks, tick them off and delete them";
const CHANGE = "Show how many tasks are still left to do, above the list";

const streamOf = (page: Page, path: string) =>
  page.waitForResponse((response: Response) => response.url().includes(path) && response.request().method() === "POST", { timeout: 600_000 });

async function turnsSaved(page: Page, projectId: string): Promise<number> {
  const response = await page.request.get(`/api/chat/projects/${projectId}`);
  return response.ok() ? ((await response.json()) as unknown[]).length : 0;
}

const savedTurns = (page: Page, projectId: string, atLeast: number) =>
  expect.poll(() => turnsSaved(page, projectId), { timeout: 600_000, intervals: [250] }).toBeGreaterThanOrEqual(atLeast);

test("how long each step takes with the real model", async ({ page }) => {
  test.skip(stack().ai !== "real", "needs --real-ai");

  const numbers: Record<string, unknown> = { idea: IDEA, change: CHANGE, at: new Date().toISOString() };
  const person = await aNewPerson();

  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill(person.email);
  await page.getByRole("textbox", { name: "Password" }).fill(person.password);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/projects");

  await page.getByLabel("Describe the project you want to build").fill(IDEA);
  let elapsed = stopwatch();
  await page.getByRole("button", { name: "Create project" }).click();
  const plan = page.getByRole("heading", { name: "Here’s the plan" });
  const question = page.getByText(/^Question \d+ of \d+$/);
  await expect(question.or(plan).first()).toBeVisible({ timeout: 120_000 });
  numbers.interviewMs = elapsed();

  elapsed = stopwatch();
  if (await plan.isVisible()) {
    numbers.interviewQuestions = 0;
    await page.getByRole("button", { name: "Build it" }).click();
  } else {
    numbers.interviewQuestions = Number((await question.innerText()).match(/of (\d+)/i)?.[1] ?? 0);
    await page.getByRole("button", { name: "Skip questions" }).click();
  }
  await page.waitForURL(/\/projects\/\d+$/, { timeout: 180_000 });
  const projectId = page.url().split("/").pop()!;
  numbers.briefAndProjectMs = elapsed();

  const buildClock = stopwatch();
  await expect(page.getByRole("button", { name: /Thought process/ })).toBeVisible({ timeout: 180_000 });
  numbers.firstBuildFirstWordMs = buildClock();
  await savedTurns(page, projectId, 2);
  numbers.firstBuildSavedMs = buildClock();
  numbers.pressToFirstBuildSavedMs = elapsed();

  const app = page.frameLocator('iframe[title="Live preview"]');
  elapsed = stopwatch();
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect
    .poll(async () => (await app.locator("#root").innerText({ timeout: 2_000 }).catch(() => "")).trim().length, { timeout: 300_000 })
    .toBeGreaterThan(0);
  numbers.previewVisibleMs = elapsed();
  await expect(page.getByRole("status").filter({ hasText: "Up to date" })).toBeVisible({ timeout: 120_000 });
  numbers.previewUpToDateMs = elapsed();

  await page.getByRole("button", { name: "Mode: Build" }).click();
  await page.getByRole("menuitem", { name: "Teach me" }).click();
  await expect(async () => {
    if (await page.getByRole("menu").isVisible()) await page.getByRole("menu").press("Escape");
    await expect(page.getByRole("button", { name: "Mode: Teach me" })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "Message Singularity" }).fill(CHANGE);
  elapsed = stopwatch();
  await page.getByRole("button", { name: "Send message" }).click();
  await savedTurns(page, projectId, 4);
  numbers.changeSavedMs = elapsed();
  await expect(page.getByRole("status").filter({ hasText: "Up to date" })).toBeVisible({ timeout: 120_000 });
  numbers.changeInPreviewMs = elapsed();

  const bigPicture = page.getByRole("button", { name: /^The big picture/ }).last();
  if (await bigPicture.isVisible()) {
    const overview = streamOf(page, "/code/overview/stream");
    elapsed = stopwatch();
    await bigPicture.click();
    await overview;
    numbers.bigPictureFirstByteMs = elapsed();
    await page.waitForTimeout(15_000);
  }
  const steps = page.getByRole("button", { name: /^Build steps/ }).last();
  if (await steps.isVisible()) await steps.click();
  const lessonButton = page.getByRole("button", { name: /^What this step changed in / }).last();
  await expect(lessonButton).toBeVisible({ timeout: 60_000 });
  const lessonsMetered = async () => {
    const page0 = (await (await page.request.get("/api/usage/events?page=0&size=50")).json()) as { events: { feature: string }[] };
    return page0.events.filter((event) => event.feature === "EXPLAIN").length;
  };
  const lessonsBefore = await lessonsMetered();
  const lesson = streamOf(page, "/code/lesson/stream");
  elapsed = stopwatch();
  await lessonButton.click();
  await lesson;
  numbers.lessonFirstByteMs = elapsed();
  await expect.poll(lessonsMetered, { timeout: 180_000, intervals: [200] }).toBeGreaterThan(lessonsBefore);
  numbers.lessonCompleteMs = elapsed();

  numbers.usageToday = await (await page.request.get(`/api/usage/today?projectId=${projectId}`)).json();
  numbers.usageEvents = await (await page.request.get("/api/usage/events?page=0&size=50")).json();
  numbers.turns = await turnsSaved(page, projectId);

  await page.getByRole("tab", { name: "Preview" }).click();
  await page.getByRole("button", { name: "Stop preview" }).click();

  const results = fileURLToPath(new URL("../test-results/", import.meta.url));
  mkdirSync(results, { recursive: true });
  writeFileSync(results + "numbers.json", JSON.stringify(numbers, null, 2));
  const { usageEvents, ...summary } = numbers;
  console.log(JSON.stringify(summary, null, 2));
});
