/**
 * The opening every browser test here shares: a person signing in, and a project with its first build saved.
 *
 * Handles: signing in through the app's own form; describing the idea, answering the interview and pressing Build
 * it; and waiting until the server - not the chat, which draws a build before it is saved - hands back the page the
 * build wrote. The model is the scripted one, so the app is always the same small notes app.
 */
import { expect, type Page } from "@playwright/test";
import type { Person } from "./support";

export const IDEA = "A notes app where I can write, search and delete notes";

export const savedFile = (projectId: string, path: string) =>
  `/api/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`;

export async function signIn(page: Page, person: Person) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill(person.email);
  await page.getByRole("textbox", { name: "Password" }).fill(person.password);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/projects");
}

export async function buildTheNotesApp(page: Page): Promise<string> {
  await page.getByLabel("Describe the project you want to build").fill(IDEA);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("Question 1 of 2")).toBeVisible();
  await page.getByRole("group").getByRole("button").first().click();
  await expect(page.getByText("Question 2 of 2")).toBeVisible();
  await page.getByRole("group").getByRole("button").first().click();
  await expect(page.getByRole("heading", { name: "Here’s the plan" })).toBeVisible();

  await page.getByRole("button", { name: "Build it" }).click();
  await page.waitForURL(/\/projects\/\d+$/);
  const projectId = page.url().split("/").pop()!;

  await expect(page.getByText("4/4", { exact: true })).toBeVisible({ timeout: 120_000 });
  await expect
    .poll(async () => (await page.request.get(savedFile(projectId, "src/pages/Index.tsx"))).text(), { timeout: 120_000 })
    .toContain("Quick Notes");
  return projectId;
}
