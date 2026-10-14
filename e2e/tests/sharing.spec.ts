/**
 * Two people and one project, in two real browsers, against the real services.
 *
 * Handles, in order: an invitation giving nothing until it is accepted, and being answered the same way for an
 * address nobody has an account under; the invited person accepting it from their dashboard and opening the project;
 * the owner withdrawing an invitation; both of them seeing the one preview, and the page inside it being unable to
 * take the workspace anywhere - by script or by a link aimed at the top window; one of them stopping a response the
 * other started; and the invited person removing the project from their own list, which ends their access and
 * leaves the project where it was.
 *
 * These are the things that need a second signed-in person, which is why they were checked by hand before this
 * existed. The slow response is the scripted model's: a request that says "take your time" is held back for a
 * minute (StubChatModel), so the turn is still running when the second person meets it, and the step would time out
 * rather than pass if stopping did nothing.
 */
import { expect, test, type Page } from "@playwright/test";
import { stack } from "../playwright.config";
import { buildTheNotesApp, savedFile, signIn } from "./project";
import { aNewPerson, stopwatch } from "./support";

const NOBODY = `nobody-${Date.now()}@example.com`;

async function openShare(page: Page) {
  const panel = page.getByRole("dialog").filter({ hasText: "Share project" });
  if (!(await panel.isVisible())) await page.getByRole("button", { name: "Share and manage access" }).click();
  await expect(panel).toBeVisible();
  return panel;
}

async function invite(page: Page, email: string): Promise<number> {
  const panel = await openShare(page);
  const answered = page.waitForResponse(
    (response) => response.request().method() === "POST" && /\/api\/projects\/\d+\/members/.test(response.url()),
  );
  await panel.getByRole("textbox", { name: "Email to invite" }).fill(email);
  await panel.getByRole("button", { name: "Invite", exact: true }).click();
  return (await answered).status();
}

test("an owner shares a project with someone who accepts, works beside them and leaves", async ({ page, browser }) => {
  test.skip(stack().ai !== "stub", "The stack is running a real model; this expects the scripted one.");
  test.setTimeout(5 * 60_000);

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const owner = await aNewPerson();
  await signIn(page, owner);
  const projectId = await buildTheNotesApp(page);
  const projectUrl = page.url();
  const projectName = ((await (await page.request.get(`/api/projects/${projectId}`)).json()) as { name: string }).name;

  const friend = await aNewPerson();
  const friendContext = await browser.newContext();
  const friendPage = await friendContext.newPage();
  friendPage.on("pageerror", (error) => pageErrors.push(error.message));
  await signIn(friendPage, friend);

  const asFriend = async (path: string) => (await friendPage.request.get(path)).status();
  const active = async () => (await page.request.get(`/api/chat/projects/${projectId}/active`)).status();

  await test.step("an invitation gives nothing until it is accepted, and says the same for an address nobody has", async () => {
    const toSomeone = await invite(page, friend.email);
    const panel = await openShare(page);
    await expect(panel.getByText("Invited, not accepted yet")).toBeVisible();
    await expect(panel.getByText(friend.email)).toBeVisible();

    const toNobody = await invite(page, NOBODY);
    await expect(panel.getByText(NOBODY)).toBeVisible();
    expect(toSomeone).toBeLessThan(300);
    expect(toNobody).toBe(toSomeone);

    expect([403, 404]).toContain(await asFriend(`/api/projects/${projectId}`));
    expect([403, 404]).toContain(await asFriend(savedFile(projectId, "src/pages/Index.tsx")));
    await page.keyboard.press("Escape");
  });

  await test.step("the invited person is told on their dashboard, accepts from the notice and can open the project", async () => {
    await friendPage.goto("/projects");
    const notice = friendPage.getByRole("status").filter({ hasText: "Project invitation" });
    await expect(notice.getByText(projectName).first()).toBeVisible();
    await expect(notice.getByText(/invited you to edit/).first()).toBeVisible();
    await notice.getByRole("button", { name: "Accept" }).click();
    await expect(notice).toHaveCount(0);

    expect(await asFriend(`/api/projects/${projectId}`)).toBe(200);
    expect(await asFriend(savedFile(projectId, "src/pages/Index.tsx"))).toBe(200);
    await friendPage.goto(projectUrl);
    await expect(friendPage.getByRole("textbox", { name: "Message Singularity" })).toBeVisible();
  });

  await test.step("the owner sees who accepted and withdraws the invitation nobody took", async () => {
    await page.reload();
    const panel = await openShare(page);
    await expect(panel.getByText(friend.email)).toBeVisible();
    await panel.getByRole("button", { name: `Withdraw the invitation to ${NOBODY}` }).click();
    await expect(panel.getByText(NOBODY)).toHaveCount(0);
    await expect(panel.getByText("Invited, not accepted yet")).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  await test.step("both see the one preview, and the page inside it cannot take the workspace anywhere", async () => {
    await page.getByRole("tab", { name: "Preview" }).click();
    const frame = page.locator('iframe[title="Live preview"]');
    await expect(page.frameLocator('iframe[title="Live preview"]').getByRole("heading", { name: "Quick Notes" })).toBeVisible({ timeout: 180_000 });

    const sandbox = (await frame.getAttribute("sandbox")) ?? "";
    expect(sandbox).toContain("allow-scripts");
    expect(sandbox).not.toContain("allow-top-navigation");

    const inside = page.frames().find((candidate) => new URL(candidate.url()).port === String(stack().previewPort));
    expect(inside, "the preview's frame").toBeTruthy();
    const byScript = await inside!.evaluate(() => {
      try {
        window.top!.location.href = `${window.location.origin}/taken-by-script`;
        return "allowed";
      } catch (error) {
        return (error as Error).name;
      }
    });
    await inside!.evaluate(() => {
      const link = document.createElement("a");
      link.href = `${window.location.origin}/taken-by-link`;
      link.target = "_top";
      link.textContent = "leave";
      link.id = "journey-top-link";
      document.body.append(link);
    });
    await page.frameLocator('iframe[title="Live preview"]').locator("#journey-top-link").click();
    await page.waitForTimeout(1_500);

    expect(byScript).not.toBe("allowed");
    expect(page.url()).toBe(projectUrl);
    await expect(frame).toBeVisible();

    await friendPage.getByRole("tab", { name: "Preview" }).click();
    await friendPage.getByRole("button", { name: "Start preview" }).click();
    await expect(friendPage.frameLocator('iframe[title="Live preview"]').getByRole("heading", { name: "Quick Notes" })).toBeVisible({ timeout: 120_000 });
    await friendPage.getByRole("tab", { name: "Code" }).click();
  });

  await test.step("one of them stops a response the other started", async () => {
    await page.getByRole("textbox", { name: "Message Singularity" }).fill("Take your time and show how many notes there are");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect.poll(active, { timeout: 30_000 }).toBe(200);

    const elapsed = stopwatch();
    await friendPage.getByRole("textbox", { name: "Message Singularity" }).fill("Add a title to the page");
    await friendPage.getByRole("button", { name: "Send message" }).click();
    await expect(friendPage.getByText("A response is already in progress").first()).toBeVisible();
    await friendPage.getByRole("button", { name: "Stop it" }).click();
    await expect(friendPage.getByText("Stopped", { exact: true }).first()).toBeVisible();

    await expect.poll(active, { timeout: 20_000 }).toBe(204);
    expect(elapsed(), "the turn was stopped, not left to finish").toBeLessThan(45_000);
    await expect(page.getByRole("button", { name: "Stop generating" })).toHaveCount(0, { timeout: 30_000 });
  });

  await test.step("the invited person removes the project from their list, and only their access ends", async () => {
    const project = (await (await page.request.get(`/api/projects/${projectId}`)).json()) as { name: string; summary?: string | null };
    const title = project.summary?.trim() || project.name;
    await friendPage.goto("/projects");
    await friendPage.getByRole("button", { name: `Actions for ${title}` }).first().click();
    await friendPage.getByRole("menuitem", { name: "Remove project" }).click();
    await friendPage.getByRole("alertdialog").getByRole("button", { name: "Remove project" }).click();
    await expect(friendPage.getByText("Removed from your projects").first()).toBeVisible();

    expect([403, 404]).toContain(await asFriend(`/api/projects/${projectId}`));
    expect((await page.request.get(`/api/projects/${projectId}`)).status()).toBe(200);
    expect((await page.request.get(savedFile(projectId, "src/pages/Index.tsx"))).status()).toBe(200);
  });

  await test.step("the preview is stopped", async () => {
    await page.getByRole("button", { name: "Stop preview" }).click();
    await expect(page.locator('iframe[title="Live preview"]')).toHaveCount(0, { timeout: 60_000 });
  });

  await friendContext.close();
  expect(pageErrors, "a page threw while the two of them worked").toEqual([]);
});
