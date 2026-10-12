/*
 * Runs the finished app as one program, the way a hosting site expects: `npm run build`, then `npm start`.
 *
 * Handles: serving the built pages from the `dist` folder, sending `index.html` for any address that is a page of the
 * app and not a file, and - when the project has a server of its own in `server/index.ts` - starting that server and
 * passing every request under `/api` on to it.
 *
 * You do not need this file while you are building: the preview and `npm run dev` do the same job in their own way.
 * It matters when the app leaves for a host. The host says which port to listen on through `PORT`; the app's own
 * server is started on port 3001 beside it, which is the port it uses everywhere else too.
 *
 * It uses nothing but Node itself, so there is nothing here to install or keep up to date. Leave it as it is.
 */
import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const port = Number(process.env.PORT) || 3000;
const apiPort = port === 3001 ? 3002 : 3001;
const dist = path.resolve("dist");
const hasServer = existsSync("server/index.ts");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function send(res, status, type, body) {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function fileFor(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const wanted = path.resolve(dist, "." + path.posix.normalize("/" + decoded));
  if (wanted !== dist && !wanted.startsWith(dist + path.sep)) return null;
  if (existsSync(wanted) && statSync(wanted).isFile()) return wanted;
  return path.extname(wanted) ? null : path.join(dist, "index.html");
}

function servePage(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "text/plain; charset=utf-8", "Method not allowed");
    return;
  }
  const file = fileFor(new URL(req.url, "http://localhost").pathname);
  if (!file || !existsSync(file)) {
    send(res, 404, "text/plain; charset=utf-8", existsSync(dist) ? "Not found" : "Run `npm run build` first.");
    return;
  }
  const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
  const cache = file.includes(path.sep + "assets" + path.sep) ? "public, max-age=31536000, immutable" : "no-cache";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": cache });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}

function passToServer(req, res) {
  const upstream = http.request(
    { host: "127.0.0.1", port: apiPort, method: req.method, path: req.url, headers: { ...req.headers, host: `127.0.0.1:${apiPort}` } },
    (answer) => {
      res.writeHead(answer.statusCode || 502, answer.headers);
      answer.pipe(res);
    }
  );
  upstream.on("error", () => {
    if (!res.headersSent) send(res, 502, "application/json; charset=utf-8", JSON.stringify({ error: "The app's server is not answering." }));
    else res.end();
  });
  req.pipe(upstream);
}

if (hasServer) {
  const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: { ...process.env, PORT: String(apiPort) },
    stdio: "inherit",
  });
  server.on("exit", (code) => {
    console.error(`The app's server stopped (exit code ${code}).`);
    process.exit(code || 1);
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      server.kill(signal);
      process.exit(0);
    });
  }
}

http
  .createServer((req, res) => {
    const isApi = req.url === "/api" || req.url.startsWith("/api/") || req.url.startsWith("/api?");
    if (isApi && hasServer) passToServer(req, res);
    else if (isApi) send(res, 404, "application/json; charset=utf-8", JSON.stringify({ error: "This app has no server." }));
    else servePage(req, res);
  })
  .listen(port, () => {
    console.log(`The app is running on port ${port}.`);
  });
