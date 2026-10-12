/*
 * Tests the launcher every new project is given (the starter template's start.mjs), which runs a built app as one
 * program on a host.
 *
 * Handles: the page being served at the root and for any address that is a page of the app, a built file being served
 * with its type and a long cache while the page itself is never cached, a missing file with an extension being a 404
 * and not the page, an address that tries to climb out of the build never reaching a file outside it, anything but a
 * read being refused, a request under /api being answered as "no server" by an app that has none, and an app that
 * was never built saying so.
 *
 * It runs the real file in a temporary folder with a small build beside it. The half that needs a project's own
 * server - starting it and passing /api on - needs the project's packages installed, so it is exercised where they
 * are: scripts/bench-verify.sh starts every benchmark project that has a server through this same file.
 *
 *   node --test scripts/starter-launcher.test.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const LAUNCHER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../workspace-service/src/main/resources/starter-templates/react-vite-tailwind-shadcn-starter/start.mjs"
);

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function launch(folder) {
  const port = await freePort();
  const child = spawn(process.execPath, ["start.mjs"], { cwd: folder, env: { ...process.env, PORT: String(port) }, stdio: "pipe" });
  await new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => String(chunk).includes(`port ${port}`) && resolve());
    child.once("exit", (code) => reject(new Error(`the launcher stopped with ${code}`)));
  });
  const stopped = new Promise((resolve) => child.once("exit", resolve));
  return {
    base: `http://127.0.0.1:${port}`,
    stop: () => {
      child.kill();
      return stopped;
    },
  };
}

let folder;
let outside;
let app;

before(async () => {
  outside = mkdtempSync(path.join(tmpdir(), "launcher-"));
  folder = path.join(outside, "project");
  mkdirSync(path.join(folder, "dist", "assets"), { recursive: true });
  cpSync(LAUNCHER, path.join(folder, "start.mjs"));
  writeFileSync(path.join(folder, "dist", "index.html"), '<!doctype html><div id="root"></div>');
  writeFileSync(path.join(folder, "dist", "assets", "app-1a2b.js"), "console.log(1);");
  writeFileSync(path.join(folder, "dist", "vite.svg"), "<svg/>");
  writeFileSync(path.join(outside, "secret.txt"), "not for anyone");
  app = await launch(folder);
});

after(async () => {
  await app?.stop();
  rmSync(outside, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

test("the page is served at the root, and is never cached", async () => {
  const res = await fetch(app.base + "/");

  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/html/);
  assert.equal(res.headers.get("cache-control"), "no-cache");
  assert.match(await res.text(), /id="root"/);
});

test("an address that is a page of the app gets the page, so a refresh on any screen works", async () => {
  for (const address of ["/settings", "/rooms/ABCD", "/a/b/c?x=1"]) {
    const res = await fetch(app.base + address);
    assert.equal(res.status, 200, address);
    assert.match(await res.text(), /id="root"/, address);
  }
});

test("a built file is served with its type and a long cache", async () => {
  const script = await fetch(app.base + "/assets/app-1a2b.js");
  const image = await fetch(app.base + "/vite.svg");

  assert.match(script.headers.get("content-type"), /^text\/javascript/);
  assert.match(script.headers.get("cache-control"), /immutable/);
  assert.equal(await script.text(), "console.log(1);");
  assert.equal(image.headers.get("content-type"), "image/svg+xml");
});

test("a missing file with an extension is a 404, not the page", async () => {
  const res = await fetch(app.base + "/assets/gone.js");

  assert.equal(res.status, 404);
  assert.doesNotMatch(await res.text(), /id="root"/);
});

test("an address that tries to climb out of the build never reaches a file outside it", async () => {
  for (const address of ["/..%2f..%2fsecret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2f..%2fsecret.txt", "/..%5c..%5csecret.txt"]) {
    const res = await fetch(app.base + address);
    assert.doesNotMatch(await res.text(), /not for anyone/, address);
  }
  const broken = await fetch(app.base + "/%E0%A4%A");
  assert.equal(broken.status, 404);
});

test("anything but a read is refused", async () => {
  assert.equal((await fetch(app.base + "/", { method: "POST" })).status, 405);
  assert.equal((await fetch(app.base + "/", { method: "HEAD" })).status, 200);
});

test("an app with no server of its own answers a request under /api as exactly that", async () => {
  for (const address of ["/api", "/api/scores", "/api?x=1"]) {
    const res = await fetch(app.base + address, { method: address === "/api/scores" ? "POST" : "GET" });
    assert.equal(res.status, 404, address);
    assert.deepEqual(await res.json(), { error: "This app has no server." });
  }
  assert.match(await (await fetch(app.base + "/apiary")).text(), /id="root"/);
});

test("an app that was never built says so", async () => {
  const empty = path.join(outside, "unbuilt");
  mkdirSync(empty);
  cpSync(LAUNCHER, path.join(empty, "start.mjs"));
  const unbuilt = await launch(empty);
  try {
    const res = await fetch(unbuilt.base + "/");
    assert.equal(res.status, 404);
    assert.match(await res.text(), /npm run build/);
  } finally {
    await unbuilt.stop();
  }
});
