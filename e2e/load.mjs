/**
 * A small load test against the journey stack: how long the application's own work takes when several people use it
 * at once, and whether anything fails.
 *
 * Handles: signing in a handful of people through the Auth emulator and the real session exchange; giving each a
 * project with one scripted build in it; then four measurements - a steady mix of the read calls a workspace makes,
 * every person sending a build at the same moment, every person starting a preview at the same moment and loading
 * its page through the proxy, and one person going past the per-user rate limit to show that it holds. It writes
 * test-results/load-report.md and load-results.json.
 *
 * It talks to the Gateway directly, not through the frontend's proxy, so what is timed is the backend. Each person is
 * kept under the limit of 600 calls a minute per service, and sign-ins under 10 a minute, because those limits are
 * part of what is being run - which also caps how hard this can push: it is a check that latency stays flat with
 * several people working, not a search for the breaking point.
 *
 * The model is the scripted one, so the build numbers are the pipeline's own cost - parsing, checking, saving,
 * publishing a revision - with the provider's time taken out. Everything runs on one machine, load generator
 * included, so the numbers are a floor for comparison between runs, not a forecast of production.
 *
 * Usage, with the stack up (e2e/stack.sh up --context kind-<cluster>):
 *   node load.mjs [--users 8] [--seconds 60] [--rate 6] [--previews 4]
 */
import http from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const option = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? Number(process.argv[at + 1]) : fallback;
};
const USERS = option("users", 8);
const SECONDS = option("seconds", 60);
const RATE = option("rate", 6);
const PREVIEWS = Math.min(option("previews", 4), USERS);

const stack = JSON.parse(readFileSync(fileURLToPath(new URL("./.run/stack.json", import.meta.url)), "utf8"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Person {
  constructor(number) {
    this.email = `load-${Date.now()}-${number}@example.com`;
    this.password = "Load-test-pass-2026!";
    this.cookies = new Map();
  }

  async call(method, path, body) {
    const headers = { cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ") };
    if (method !== "GET") {
      headers["X-XSRF-TOKEN"] = decodeURIComponent(this.cookies.get("__Host-XSRF-TOKEN") ?? "");
      if (body !== undefined) headers["content-type"] = "application/json";
    }
    const response = await fetch(stack.gateway + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const at = pair.indexOf("=");
      this.cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return response;
  }

  async json(method, path, body) {
    const response = await this.call(method, path, body);
    if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  }

  async signIn() {
    const emulator = `${stack.authEmulator}/identitytoolkit.googleapis.com/v1`;
    const post = (url, payload, extra = {}) =>
      fetch(url, { method: "POST", headers: { "content-type": "application/json", ...extra }, body: JSON.stringify(payload) }).then((r) => r.json());
    const created = await post(`${emulator}/accounts:signUp?key=load`, { email: this.email, password: this.password, returnSecureToken: true });
    await post(`${emulator}/projects/${stack.firebaseProject}/accounts:update`, { localId: created.localId, emailVerified: true }, { authorization: "Bearer owner" });
    const signedIn = await post(`${emulator}/accounts:signInWithPassword?key=load`, { email: this.email, password: this.password, returnSecureToken: true });
    await this.call("GET", "/api/auth/csrf");
    await this.json("POST", "/api/auth/session", { idToken: signedIn.idToken });
  }

  async build(message) {
    const started = performance.now();
    const response = await this.call("POST", "/api/chat/stream", { message, projectId: this.projectId });
    if (!response.ok) {
      await response.arrayBuffer();
      return { firstPiece: NaN, total: performance.now() - started, outcome: `HTTP ${response.status}` };
    }
    let firstPiece = null;
    let outcome = null;
    let buffer = "";
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      if (firstPiece === null) firstPiece = performance.now() - started;
      buffer += decoder.decode(chunk, { stream: true });
      const done = buffer.match(/event:\s*done\s*\ndata:\s*(\{.*\})/);
      if (done) {
        outcome = JSON.parse(done[1]).text;
        break;
      }
    }
    return { firstPiece, total: performance.now() - started, outcome };
  }
}

function previewRequest(url, cookie) {
  const target = new URL(url);
  return new Promise((resolve) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port: target.port,
        path: target.pathname + target.search,
        headers: cookie ? { host: target.host, cookie } : { host: target.host },
        timeout: 15_000,
      },
      (response) => {
        let size = 0;
        response.on("data", (piece) => (size += piece.length));
        response.on("end", () => resolve({ status: response.statusCode, size, headers: response.headers }));
      },
    );
    request.on("error", () => resolve({ status: 0, size: 0, headers: {} }));
    request.on("timeout", () => request.destroy());
    request.end();
  });
}

async function previewVisitor(url) {
  const exchange = await previewRequest(url);
  const cookie = (exchange.headers["set-cookie"] ?? []).map((value) => value.split(";")[0]).join("; ");
  if (exchange.status !== 302 || !cookie) return null;
  const page = new URL(exchange.headers.location ?? "/", url).toString();
  return () => previewRequest(page, cookie);
}

const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : NaN);
function summarise(samples) {
  const times = samples.map((sample) => sample.ms).sort((a, b) => a - b);
  const failed = samples.filter((sample) => !sample.ok).length;
  return {
    calls: samples.length,
    failed,
    errorRate: samples.length ? failed / samples.length : 0,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    max: times.at(-1) ?? NaN,
  };
}
const ms = (value) => (Number.isFinite(value) ? `${value < 10 ? value.toFixed(1) : Math.round(value)} ms` : "-");
const seconds = (value) => (Number.isFinite(value) ? `${(value / 1000).toFixed(1)} s` : "-");
const row = (name, s) => `| ${name} | ${s.calls} | ${ms(s.p50)} | ${ms(s.p95)} | ${ms(s.p99)} | ${ms(s.max)} | ${(100 * s.errorRate).toFixed(2)}% |`;

console.log(`Signing in ${USERS} people and giving each a project with one build in it`);
const people = Array.from({ length: USERS }, (_, number) => new Person(number));
for (const person of people) {
  await person.signIn();
  person.projectId = (await person.json("POST", "/api/projects/from-prompt", { prompt: "A notes app" })).id;
}
for (const person of people) {
  const first = await person.build("A notes app where I can write and delete notes");
  if (first.outcome !== "SAVED") throw new Error(`A first build did not save: ${first.outcome}`);
}

const READS = [
  ["GET /api/auth/me", "account", () => "/api/auth/me"],
  ["GET /api/me/subscription", "account", () => "/api/me/subscription"],
  ["GET /api/plans", "account", () => "/api/plans"],
  ["GET /api/projects", "workspace", () => "/api/projects"],
  ["GET /api/projects/{id}", "workspace", (p) => `/api/projects/${p.projectId}`],
  ["GET /api/projects/{id}/files", "workspace", (p) => `/api/projects/${p.projectId}/files`],
  ["GET /api/projects/{id}/files/content", "workspace", (p) => `/api/projects/${p.projectId}/files/content?path=${encodeURIComponent("src/pages/Index.tsx")}`],
  ["GET /api/chat/projects/{id}", "intelligence", (p) => `/api/chat/projects/${p.projectId}`],
  ["GET /api/usage/today", "intelligence", (p) => `/api/usage/today?projectId=${p.projectId}`],
];

console.log(`Reads: ${USERS} people, ${RATE} calls a second each, for ${SECONDS} s`);
const readSamples = new Map(READS.map(([name]) => [name, []]));
const inFlight = [];
const readsStarted = performance.now();
let tick = 0;
while (performance.now() - readsStarted < SECONDS * 1000) {
  for (const person of people) {
    const [name, , path] = READS[(tick + people.indexOf(person)) % READS.length];
    const started = performance.now();
    inFlight.push(
      person
        .call("GET", path(person))
        .then(async (response) => {
          await response.arrayBuffer();
          readSamples.get(name).push({ ms: performance.now() - started, ok: response.ok, status: response.status });
        })
        .catch(() => readSamples.get(name).push({ ms: performance.now() - started, ok: false, status: 0 })),
    );
  }
  tick++;
  const next = readsStarted + (tick * 1000) / RATE;
  await sleep(Math.max(0, next - performance.now()));
}
await Promise.all(inFlight);
const readSeconds = (performance.now() - readsStarted) / 1000;
const allReads = [...readSamples.values()].flat();

console.log(`Builds: ${USERS} people sending a change at the same moment`);
const builds = await Promise.all(people.map((person) => person.build("Show how many notes there are")));

console.log(`Previews: ${PREVIEWS} people starting one at the same moment`);
const previews = await Promise.all(
  people.slice(0, PREVIEWS).map(async (person) => {
    const started = performance.now();
    let preview = await person.json("POST", `/api/projects/${person.projectId}/preview`);
    let waited = false;
    while (preview.status === "CREATING" && performance.now() - started < 300_000) {
      waited ||= preview.queuePosition != null;
      await sleep(500);
      preview = await person.json("GET", `/api/projects/${person.projectId}/preview`);
    }
    const running = performance.now() - started;
    let page = { status: 0, size: 0 };
    let visit = null;
    while (preview.status === "RUNNING" && page.status !== 200 && performance.now() - started < 120_000) {
      visit ??= await previewVisitor(preview.previewUrl);
      if (visit) page = await visit();
      if (page.status !== 200) await sleep(300);
    }
    return { person, status: preview.status, detail: preview.detail, waited, running, served: page.status === 200 ? performance.now() - started : NaN, visit };
  }),
);

const up = previews.filter((preview) => preview.status === "RUNNING" && preview.visit);
const pageSamples = [];
if (up.length) {
  console.log("Preview pages: 200 loads through the proxy, 4 at a time");
  for (let batch = 0; batch < 50; batch++) {
    await Promise.all(
      Array.from({ length: 4 }, async (_, slot) => {
        const started = performance.now();
        const page = await up[(batch + slot) % up.length].visit();
        pageSamples.push({ ms: performance.now() - started, ok: page.status === 200, status: page.status });
      }),
    );
  }
}
await Promise.all(previews.map((preview) => preview.person.call("DELETE", `/api/projects/${preview.person.projectId}/preview`)));

console.log("Rate limit: one person sending 700 calls at once");
const burst = await Promise.all(Array.from({ length: 700 }, () => people[0].call("GET", "/api/auth/me").then((response) => response.status)));
const burstCounts = burst.reduce((counts, status) => ({ ...counts, [status]: (counts[status] ?? 0) + 1 }), {});

const buildSummary = (pick) => summarise(builds.map((build) => ({ ms: pick(build), ok: build.outcome === "SAVED" })));
const lines = [
  "# Load test",
  "",
  `Run ${new Date().toISOString()} against the journey stack on one machine: ${USERS} signed-in people, the scripted model.`,
  "",
  "## Reads",
  "",
  `${USERS} people, each making ${RATE} calls a second for ${Math.round(readSeconds)} s: ${allReads.length} calls, ${(allReads.length / readSeconds).toFixed(0)} a second.`,
  "",
  "| Call | Calls | p50 | p95 | p99 | Slowest | Failed |",
  "|---|---|---|---|---|---|---|",
  ...READS.map(([name]) => row(`\`${name}\``, summarise(readSamples.get(name)))),
  row("**All reads**", summarise(allReads)),
  "",
  "## Builds at the same moment",
  "",
  `${USERS} people each sent a change at once: ${builds.map((build) => build.outcome).join(", ")}. The scripted model answers in about a second, so this is the pipeline's own work.`,
  "",
  "| | Turns | p50 | p95 | Slowest | Not saved |",
  "|---|---|---|---|---|---|",
  ...[["To the first piece of the answer", (b) => b.firstPiece], ["To the turn saved (`done`)", (b) => b.total]].map(([name, pick]) => {
    const s = buildSummary(pick);
    return `| ${name} | ${s.calls} | ${ms(s.p50)} | ${ms(s.p95)} | ${ms(s.max)} | ${s.failed} |`;
  }),
  "",
  "## Previews at the same moment",
  "",
  `${PREVIEWS} people each started a preview at once, against a warm pool of two.`,
  "",
  "| Person | Ended | Waited in line | To running | To the page answering |",
  "|---|---|---|---|---|",
  ...previews.map((p, index) => `| ${index + 1} | ${p.status}${p.status === "RUNNING" ? "" : ` (${p.detail ?? ""})`} | ${p.waited ? "yes" : "no"} | ${seconds(p.running)} | ${seconds(p.served)} |`),
  "",
  ...(pageSamples.length
    ? ["| Call | Calls | p50 | p95 | p99 | Slowest | Failed |", "|---|---|---|---|---|---|---|", row("A preview's page through the proxy", summarise(pageSamples)), ""]
    : []),
  "## The rate limit",
  "",
  `One person sent 700 calls to one service at once: ${Object.entries(burstCounts).map(([status, count]) => `${count} answered ${status}`).join(", ")}. The limit is a bucket of 600 per person per service that refills at 10 a second, which is why a burst that takes a moment gets a few more than 600.`,
  "",
];

const out = fileURLToPath(new URL("./test-results/", import.meta.url));
mkdirSync(out, { recursive: true });
writeFileSync(out + "load-report.md", lines.join("\n"));
writeFileSync(
  out + "load-results.json",
  JSON.stringify(
    {
      users: USERS,
      reads: Object.fromEntries(READS.map(([name]) => [name, summarise(readSamples.get(name))])),
      allReads: summarise(allReads),
      readsPerSecond: allReads.length / readSeconds,
      builds: { firstPiece: buildSummary((b) => b.firstPiece), total: buildSummary((b) => b.total), outcomes: builds.map((b) => b.outcome) },
      previews: previews.map(({ status, waited, running, served }) => ({ status, waited, running, served })),
      previewPage: summarise(pageSamples),
      burst: burstCounts,
    },
    null,
    2,
  ),
);
console.log("\n" + lines.join("\n"));

const broken =
  summarise(allReads).failed > 0 ||
  builds.some((build) => build.outcome !== "SAVED") ||
  previews.some((p) => p.status !== "RUNNING" || !Number.isFinite(p.served)) ||
  summarise(pageSamples).failed > 0;
process.exit(broken ? 1 : 0);
