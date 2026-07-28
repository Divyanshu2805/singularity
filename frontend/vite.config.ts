/**
 * The build and dev-server configuration.
 *
 * Handles: the React plugin, the path alias, injecting the Content Security Policy into production builds, and
 * proxying API calls in development.
 *
 * The proxy is what keeps API calls same-origin in development, so the app works on any port without depending on
 * backend CORS and the SameSite session cookie is always sent. It points at the Gateway, which is the browser's
 * single origin.
 */
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { buildContentSecurityPolicy } from "./csp";

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
    plugins: [react(), mode === "development" && componentTagger(), contentSecurityPolicy(env)].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
