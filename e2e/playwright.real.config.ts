/**
 * How the real-model measurement is run (`npm run numbers`).
 *
 * Handles: the same browser and limits as the journey test, pointed at e2e/real instead of e2e/tests, so the
 * ordinary `npm test` can never start a run that spends tokens.
 */
import { defineConfig } from "@playwright/test";
import journey from "./playwright.config";

export default defineConfig({
  ...journey,
  testDir: "./real",
  timeout: 20 * 60_000,
  reporter: [["list"]],
});
