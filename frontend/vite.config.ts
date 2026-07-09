import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { buildContentSecurityPolicy } from "./csp";

/** Adds the Content Security Policy to index.html in production builds only - see csp.ts for why not in dev. */
const contentSecurityPolicy = (env: Record<string, string>): Plugin => ({
  name: "content-security-policy",
  apply: "build",
  transformIndexHtml: () => [
    {
      tag: "meta",
      attrs: { "http-equiv": "Content-Security-Policy", content: buildContentSecurityPolicy(env) },
      injectTo: "head-prepend",
    },
    // Cross-origin requests get the origin only - a reset link's token must never leak through the Referer.
    { tag: "meta", attrs: { name: "referrer", content: "strict-origin-when-cross-origin" }, injectTo: "head-prepend" },
  ],
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    server: {
      host: "::",
      port: Number(process.env.PORT) || 5173,
      hmr: {
        overlay: false,
      },
      // API calls stay same-origin in dev, so the app works on any port without depending on backend CORS - and the
      // session cookie (SameSite=Strict) is sent, since the browser only ever talks to this one origin.
      proxy: {
        "/api": {
          // API_PROXY_TARGET points a second dev server at a backend on another port (e.g. a branch build on 8081).
          target: process.env.API_PROXY_TARGET || "http://localhost:8080",
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => proxyReq.removeHeader("origin"));
          },
        },
      },
    },
    plugins: [react(), mode === "development" && componentTagger(), contentSecurityPolicy(env)].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
