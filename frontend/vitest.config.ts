/**
 * The test runner's configuration.
 *
 * Handles: the jsdom environment, the shared setup file, the same path alias the app uses, which files count as
 * tests, and what `npm run coverage` measures and the least it accepts.
 *
 * Coverage is held to two floors, each a little under what was measured when it was set. `src/lib` is where the
 * logic lives and where the tests aim, so it has the floor that means something. The whole app has a low one that
 * only catches a collapse: most of the rest is the landing page and the sign-in screens, which are checked by eye
 * and by the browser journey, not rendered here. The vendored `components/ui` set is left out as a library.
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/**/*.{test,spec}.{ts,tsx}", "src/test/**", "src/components/ui/**", "src/**/*.d.ts"],
      reporter: ["text-summary", "json-summary", "html"],
      thresholds: {
        lines: 25,
        "src/lib/**": { lines: 75, branches: 85, functions: 80 },
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
