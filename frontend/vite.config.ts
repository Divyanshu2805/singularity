/**
 * The build and dev-server configuration.
 *
 * Handles: the React plugin, the path alias, injecting the Content Security Policy into production builds (as a meta
 * tag, and as the csp-header.conf nginx include that serves it as a header too), and
 * proxying API calls in development.
 *
 * The proxy is what keeps API calls same-origin in development, so the app works on any port without depending on
 * backend CORS and the SameSite session cookie is always sent. It points at the Gateway, which is the browser's
 * single origin.
 *
 * The three largest libraries - the code editor, the Markdown renderer and the charts - are built as files of their
 * own (vendorChunk). Each used to be folded into the page that uses it, so the project view was one 930 kB file that
 * changed, and was downloaded again, with every release; now the part that is the app's own code is under a quarter
 * of that and the libraries stay in the browser's cache until their versions change. React is named as a fourth
 * file for a reason of its own: left unnamed, the bundler puts it inside whichever library file it meets first, and
 * every page - the landing page included - then downloads the charts to get React. Check with a build that
 * index.html preloads only `react` after changing this list.
 */
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { writeFileSync } from "fs";
import { buildContentSecurityPolicy, buildContentSecurityPolicyHeaderDirective } from "./csp";

const contentSecurityPolicy = (env: Record<string, string>): Plugin => ({
  name: "content-security-policy",
  apply: "build",
  transformIndexHtml: () => [
    {
      tag: "meta",
      attrs: { "http-equiv": "Content-Security-Policy", content: buildContentSecurityPolicy(env) },
      injectTo: "head-prepend",
    },
    { tag: "meta", attrs: { name: "referrer", content: "strict-origin-when-cross-origin" }, injectTo: "head-prepend" },
  ],
});

const contentSecurityPolicyHeader = (env: Record<string, string>): Plugin => ({
  name: "content-security-policy-header",
  apply: "build",
  closeBundle() {
    writeFileSync(path.resolve(__dirname, "csp-header.conf"), buildContentSecurityPolicyHeaderDirective(env));
  },
});

const VENDOR_CHUNKS: [string, string[]][] = [
  ["react", ["react", "react-dom", "scheduler", "react-is", "clsx"]],
  ["editor", ["@codemirror", "@uiw", "@lezer", "codemirror", "style-mod", "w3c-keyname", "crelt"]],
  ["charts", ["recharts", "recharts-scale", "victory-vendor", "decimal.js-light"]],
  ["markdown", ["react-markdown", "remark-gfm", "remark-parse", "remark-rehype", "unified", "vfile", "vfile-message"]],
];

function vendorChunk(id: string): string | undefined {
  const path = id.split("\\").join("/");
  const at = path.lastIndexOf("/node_modules/");
  if (at < 0) return undefined;
  const parts = path.slice(at + "/node_modules/".length).split("/");
  const scope = parts[0];
  const name = scope.startsWith("@") ? `${scope}/${parts[1]}` : scope;
  for (const [chunk, packages] of VENDOR_CHUNKS) {
    if (packages.includes(name) || packages.includes(scope)) return chunk;
    if (chunk === "charts" && name.startsWith("d3-")) return chunk;
    if (chunk === "markdown" && /^(micromark|mdast-|hast-|unist-)/.test(name)) return chunk;
  }
  return undefined;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    server: {
      host: "::",
      port: Number(process.env.PORT) || 5173,
      hmr: {
        overlay: false,
      },
      proxy: {
        "/api": {
          target: process.env.API_PROXY_TARGET || "http://localhost:8000",
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => proxyReq.removeHeader("origin"));
          },
        },
      },
    },
    build: {
      rollupOptions: {
        output: { manualChunks: vendorChunk },
      },
    },
    plugins: [react(), contentSecurityPolicy(env), contentSecurityPolicyHeader(env)],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
