/**
 * The read throughput ceiling of the journey stack: how many of a workspace's read calls a second the application
 * answers, and at what latency, as the number of calls in flight is raised step by step.
 *
 * Handles: signing in enough people that none of them goes over the per-user rate limit, giving each a project with
 * one scripted build in it, then for each step of the ramp keeping that many calls in flight for a fixed time -
 * closed loop, a new call as soon as one returns - over the same nine reads load.mjs mixes, from several worker
 * threads. It writes test-results/throughput-report.md and throughput-results.json.
 *
 * The limits stay as they are. Each person is paced to --per-user calls a second, which keeps every service under its
 * 600 a minute per person (workspace-service gets four of the nine reads, so 20 a second is 8.9 a second there), and a
 * sign-in refused by the 10-a-minute limit is retried after the Retry-After it was given - which is what makes signing
 * in people slow: about a minute for every ten. The people signed in are kept in test-results/throughput-people.json
 * and reused by the next run while their sessions still work, so only the first run against a stack pays for that. A
 * step whose calls per second reach the people's paced total is limited by that pacing, not by the application, and
 * the report says so.
 *
 * The load generator runs on the same machine as everything else, so the report gives the CPU time its threads used
 * per second of each step and how busy its busiest thread's event loop was: a thread near 100% would be measuring
 * itself, which is why there are several.
 *
 * Usage, with the stack up (e2e/stack.sh up --context kind-<cluster>):
 *   node throughput.mjs [--users 60] [--per-user 20] [--seconds 20] [--steps 4,8,16,32,64,128] [--threads 4] [--label x]
 *                       [--reads 0,3]   (only these of the nine reads, by position - to cost one call on its own)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const stack = JSON.parse(readFileSync(fileURLToPath(new URL("./.run/stack.json", import.meta.url)), "utf8"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const READS = [
  () => "/api/auth/me",
  () => "/api/me/subscription",
  () => "/api/plans",
  () => "/api/projects",
  (p) => `/api/projects/${p.projectId}`,
  (p) => `/api/projects/${p.projectId}/files`,
  (p) => `/api/projects/${p.projectId}/files/content?path=${encodeURIComponent("src/pages/Index.tsx")}`,
  (p) => `/api/chat/projects/${p.projectId}`,
  (p) => `/api/usage/today?projectId=${p.projectId}`,
];

class Person {
  constructor(email, cookies = [], projectId = null) {
    this.email = email;
    this.password = "Ceiling-test-pass-2026!";
    this.cookies = new Map(cookies);
    this.projectId = projectId;
    this.nextAt = 0;
    this.reads = 0;
  }

  saved() {
    return { email: this.email, cookies: [...this.cookies], projectId: this.projectId };
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
    for (;;) {
      const response = await this.call("POST", "/api/auth/session", { idToken: signedIn.idToken });
      await response.arrayBuffer();
      if (response.status !== 429) {
        if (!response.ok) throw new Error(`Signing in answered ${response.status}`);
        return;
      }
      await sleep(1000 * Number(response.headers.get("retry-after") ?? 6));
    }
  }

  async build(message) {
    const response = await this.call("POST", "/api/chat/stream", { message, projectId: this.projectId });
    if (!response.ok) return `HTTP ${response.status}`;
    let buffer = "";
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const done = buffer.match(/event:\s*done\s*\ndata:\s*(\{.*\})/);
      if (done) return JSON.parse(done[1]).text;
    }
    return "no done event";
  }
}

if (!isMainThread) {
  const { saved, perUser, reads } = workerData;
  const people = saved.map((s, index) => Object.assign(new Person(s.email, s.cookies, s.projectId), { reads: index }));
  const gap = 1000 / perUser;
  let turn = 0;
  parentPort.on("message", async ({ concurrency, seconds }) => {
    const times = [];
    const statuses = {};
    const until = performance.now() + seconds * 1000;
    const loopBefore = performance.eventLoopUtilization();
    const startedAt = performance.now();
    const worker = async () => {
      while (performance.now() < until) {
        const person = people[turn++ % people.length];
        const slot = Math.max(performance.now(), person.nextAt);
        person.nextAt = slot + gap;
        if (slot > performance.now()) await sleep(slot - performance.now());
        const path = READS[reads[person.reads++ % reads.length]](person);
        const started = performance.now();
        let status = 0;
        try {
          const response = await person.call("GET", path);
          await response.arrayBuffer();
          status = response.status;
        } catch {
          status = 0;
        }
        times.push(performance.now() - started);
        statuses[status] = (statuses[status] ?? 0) + 1;
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    const busy = performance.eventLoopUtilization(loopBefore).utilization;
    parentPort.postMessage({ times, statuses, elapsed: (performance.now() - startedAt) / 1000, busy });
  });
} else {
  const option = (name, fallback) => {
    const at = process.argv.indexOf(`--${name}`);
    return at > 0 ? process.argv[at + 1] : fallback;
  };
  const USERS = Number(option("users", 60));
  const PER_USER = Number(option("per-user", 20));
  const SECONDS = Number(option("seconds", 20));
  const STEPS = String(option("steps", "4,8,16,32,64,128")).split(",").map(Number);
  const THREADS = Number(option("threads", 4));
  const LABEL = option("label", "");
  const ONLY = option("reads", null)?.split(",").map(Number) ?? READS.map((_, index) => index);

  const out = fileURLToPath(new URL("./test-results/", import.meta.url));
  mkdirSync(out, { recursive: true });
  const peopleFile = out + "throughput-people.json";

  let people = [];
  if (existsSync(peopleFile)) {
    const candidates = JSON.parse(readFileSync(peopleFile, "utf8")).map((s) => new Person(s.email, s.cookies, s.projectId));
    const checks = await Promise.all(candidates.map((person) => person.call("GET", "/api/auth/me").then(async (r) => (await r.arrayBuffer(), r.ok))));
    people = candidates.filter((_, index) => checks[index]);
    console.log(`Reusing ${people.length} of ${candidates.length} people signed in by an earlier run`);
  }
  const save = () => writeFileSync(peopleFile, JSON.stringify(people.map((person) => person.saved())));
  if (people.length < USERS) {
    const missing = USERS - people.length;
    console.log(`Signing in ${missing} people (the sign-in limit makes this about ${Math.max(0, Math.ceil((missing - 10) / 10))} min)`);
    for (let number = 0; number < missing; number++) {
      const person = new Person(`ceiling-${Date.now()}-${number}@example.com`);
      await person.signIn();
      person.projectId = (await person.json("POST", "/api/projects/from-prompt", { prompt: "A notes app" })).id;
      const outcome = await person.build("A notes app where I can write and delete notes");
      if (outcome !== "SAVED") throw new Error(`A first build did not save: ${outcome}`);
      people.push(person);
      save();
      if (people.length % 10 === 0) console.log(`  ${people.length} signed in`);
    }
  }
  people = people.slice(0, USERS);

  const slices = Array.from({ length: THREADS }, (_, thread) => people.filter((_, index) => index % THREADS === thread));
  const workers = slices.map((slice) => new Worker(fileURLToPath(import.meta.url), { workerData: { saved: slice.map((p) => p.saved()), perUser: PER_USER, reads: ONLY } }));
  const run = (concurrency, seconds) =>
    Promise.all(
      workers.map(
        (worker, thread) =>
          new Promise((resolve) => {
            worker.once("message", resolve);
            const share = Math.floor(concurrency / THREADS) + (thread < concurrency % THREADS ? 1 : 0);
            worker.postMessage({ concurrency: Math.max(1, share), seconds });
          }),
      ),
    );

  const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : NaN);
  const ms = (value) => (Number.isFinite(value) ? `${value < 10 ? value.toFixed(1) : Math.round(value)} ms` : "-");

  console.log("Warming up for 10 s");
  await run(Math.max(THREADS, 16), 10);

  const results = [];
  for (const concurrency of STEPS) {
    const cpuBefore = process.cpuUsage();
    const parts = await run(concurrency, SECONDS);
    const cpu = process.cpuUsage(cpuBefore);
    const times = parts.flatMap((part) => part.times).sort((a, b) => a - b);
    const statuses = {};
    for (const part of parts) for (const [status, count] of Object.entries(part.statuses)) statuses[status] = (statuses[status] ?? 0) + count;
    const elapsed = Math.max(...parts.map((part) => part.elapsed));
    const failed = Object.entries(statuses).filter(([status]) => status < 200 || status >= 300).reduce((sum, [, count]) => sum + count, 0);
    const perSecond = times.length / elapsed;
    const result = {
      concurrency,
      calls: times.length,
      perSecond,
      p50: percentile(times, 50),
      p95: percentile(times, 95),
      p99: percentile(times, 99),
      max: times.at(-1) ?? NaN,
      failed,
      statuses,
      generatorCores: (cpu.user + cpu.system) / 1e6 / elapsed,
      busiestThread: Math.max(...parts.map((part) => part.busy)),
      pacingBound: perSecond >= 0.9 * USERS * PER_USER,
    };
    results.push(result);
    console.log(
      `  ${String(concurrency).padStart(4)} in flight: ${perSecond.toFixed(0)}/s, p50 ${ms(result.p50)}, p95 ${ms(result.p95)}, p99 ${ms(result.p99)}, ` +
        `failed ${failed} ${JSON.stringify(statuses)}, generator ${result.generatorCores.toFixed(2)} cores (busiest thread ${Math.round(100 * result.busiestThread)}% busy)` +
        `${result.pacingBound ? " (pacing-bound)" : ""}`,
    );
    await sleep(3000);
  }
  for (const worker of workers) await worker.terminate();

  const lines = [
    `# Read throughput${LABEL ? ` - ${LABEL}` : ""}`,
    "",
    `Run ${new Date().toISOString()} against the journey stack on one machine: ${USERS} signed-in people, each paced to ${PER_USER} calls a second (${USERS * PER_USER} a second in all), ${SECONDS} s a step, closed loop over the nine reads of load.mjs from ${THREADS} threads.`,
    "",
    "| In flight | Calls | Per second | p50 | p95 | p99 | Slowest | Failed | Generator CPU | Busiest generator thread |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...results.map(
      (r) =>
        `| ${r.concurrency} | ${r.calls} | ${r.perSecond.toFixed(0)}${r.pacingBound ? " (pacing)" : ""} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.p99)} | ${ms(r.max)} | ${r.failed} | ${r.generatorCores.toFixed(2)} cores | ${Math.round(100 * r.busiestThread)}% |`,
    ),
    "",
  ];
  writeFileSync(out + "throughput-report.md", lines.join("\n"));
  writeFileSync(out + `throughput-results${LABEL ? `-${LABEL}` : ""}.json`, JSON.stringify({ users: USERS, perUser: PER_USER, seconds: SECONDS, threads: THREADS, label: LABEL, results }, null, 2));
  console.log("\n" + lines.join("\n"));
}
