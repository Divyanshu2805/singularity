/**
 * Runs Lighthouse on the pages anyone can open without signing in, and holds them to floors.
 *
 * Handles: one run per page and per form factor (a phone on a slow connection, and a desktop), a table of the four
 * scores and the timings behind the performance score, the audits that did not pass, and failing when
 * accessibility, best practices or SEO fall under their floor. It writes test-results/lighthouse-report.md.
 *
 * Performance is reported and not enforced. It is a simulation of a slow phone run on whatever machine this is, and
 * the same build scores twenty points apart between a quiet machine and a busy one; a floor would fail builds for
 * the weather. The other three are counts of things that are right or wrong in the page, and do not move by
 * themselves.
 *
 * It needs the build served the way production serves it - compressed, with its headers - so point it at the real
 * nginx image rather than a dev server:
 *   node lighthouse.mjs http://127.0.0.1:14180/ http://127.0.0.1:14180/login
 * Pages are given as whole addresses because Git Bash rewrites a bare "/login" argument into a Windows path. The
 * browser is the one Playwright installed.
 */
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import { launch } from "chrome-launcher";
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FLOORS = { accessibility: 95, "best-practices": 95, seo: 90 };
const TIMINGS = [
  ["first-contentful-paint", "First paint"],
  ["largest-contentful-paint", "Largest paint"],
  ["total-blocking-time", "Blocked"],
  ["cumulative-layout-shift", "Layout shift"],
];

const urls = process.argv.slice(2).map((address) => new URL(address));
if (urls.length === 0) {
  console.error("Usage: node lighthouse.mjs <page address> [<page address>...]");
  process.exit(2);
}
const base = urls[0].origin;

const chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags: ["--headless=new", "--no-sandbox"] });
const rows = [];
const findings = [];
let failed = false;

try {
  for (const url of urls) {
    const page = url.pathname;
    for (const [form, config] of [["Phone", undefined], ["Desktop", desktopConfig]]) {
      const result = await lighthouse(url.toString(), { port: chrome.port, output: "json", logLevel: "error" }, config);
      const report = result.lhr;
      if (report.runtimeError) throw new Error(`Lighthouse could not load ${page}: ${report.runtimeError.message}`);

      const score = (name) => Math.round((report.categories[name].score ?? 0) * 100);
      rows.push(
        `| \`${page}\` | ${form} | ${score("performance")} | ${score("accessibility")} | ${score("best-practices")} | ${score("seo")} | ` +
          TIMINGS.map(([id]) => report.audits[id].displayValue ?? "-").join(" | ") + " |",
      );

      for (const [name, floor] of Object.entries(FLOORS)) {
        if (score(name) < floor) {
          failed = true;
          findings.push(`- **${page} (${form}) is under the floor for ${name}: ${score(name)} < ${floor}**`);
        }
        for (const reference of report.categories[name].auditRefs) {
          const audit = report.audits[reference.id];
          if (audit.score !== null && audit.score < 1) findings.push(`- \`${page}\` (${form}), ${name}: ${audit.title}`);
        }
      }
    }
  }
} finally {
  await chrome.kill();
}

const lines = [
  "# Lighthouse",
  "",
  `Run ${new Date().toISOString()} against ${base}. Performance is a simulated slow phone (and a desktop) on this machine and is not enforced; the other three are held to ${Object.entries(FLOORS).map(([name, floor]) => `${name} ${floor}`).join(", ")}.`,
  "",
  "| Page | As | Performance | Accessibility | Best practices | SEO | " + TIMINGS.map(([, label]) => label).join(" | ") + " |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...rows,
  "",
  findings.length ? "## What did not pass" : "Every accessibility, best-practices and SEO audit passed.",
  "",
  ...[...new Set(findings)],
  "",
];

const out = fileURLToPath(new URL("./test-results/", import.meta.url));
mkdirSync(out, { recursive: true });
writeFileSync(out + "lighthouse-report.md", lines.join("\n"));
console.log(lines.join("\n"));
process.exit(failed ? 1 : 0);
