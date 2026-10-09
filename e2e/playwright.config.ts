/**
 * How the browser journey test is run.
 *
 * Handles: where the app under test is (the stack e2e/stack.sh started, read from the file it leaves behind), one
 * browser and one worker, generous time limits, and what is kept when a run fails.
 *
 * One worker and no retries on purpose. The journey is one person's path through one project, each step building on
 * the last, and a retry that started again half-way would be testing a different thing. The limits are long because
 * the slowest step is real: a runner pod installing packages and starting a dev server.
 */
import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Stack = {
  frontend: string;
  gateway: string;
  authEmulator: string;
  firebaseProject: string;
  previewPort: number;
  ai: "stub" | "real";
};

export function stack(): Stack {
  const file = fileURLToPath(new URL("./.run/stack.json", import.meta.url));
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Stack;
  } catch {
    throw new Error("The journey stack is not running. Start it with: e2e/stack.sh up --context kind-<cluster>");
  }
}

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 10 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: stack().frontend,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
