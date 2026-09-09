# VibeCraft Frontend

The React single-page app for VibeCraft: sign-in, the project dashboard, the build chat with its live checklist, the code editor and diff view, live previews, code insight, billing and usage.

## Stack

React 18 and TypeScript, built with Vite 5. Styling is Tailwind CSS with shadcn/ui (Radix UI) components; server state uses TanStack Query; the editor is CodeMirror 6; sign-in uses the Firebase JS SDK. Tests run on Vitest with Testing Library.

## Getting started

The frontend expects the backend to be running — see [local development](../docs/local-development/README.md).

```bash
npm install
cp .env.example .env.local   # fill in the Firebase web config
npm run dev                   # http://localhost:5173
```

In development, Vite proxies `/api` to the Gateway on `http://localhost:8000`, so every API call is same-origin and the session cookie is always sent.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | ESLint |
| `npm run build` | Production build (type-check separately with `npx tsc --noEmit`) |
| `npm run preview` | Serve the production build locally |

## Configuration

| Variable | Purpose |
|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | Firebase web config (required) |
| `VITE_CSP_FRAME_ORIGINS` | Production builds: origins previews are served from, allowed in the CSP's `frame-src` |
| `VITE_PAYMENTS_TEST_MODE` | Production builds: `true` shows the Stripe test-mode notice |

Values are inlined at build time. Production builds also inject a Content Security Policy (`csp.ts`).

## Structure

```
src/
  pages/        routed views (ProjectView, ProjectsDashboard, BillingSettings, …)
  components/   feature components; components/ui/ is the vendored shadcn/ui set
  hooks/        React hooks, mostly thin wrappers around lib/
  lib/          the API client, SSE parsing, module-level stores, and framework-free logic
```

Two rules keep the code manageable:

- **Logic lives in `lib/`** and is tested there without rendering. `lib/` never imports from `components/` or `pages/`.
- **Module-level stores register with `onSignOut(...)`** in `lib/session.ts`, so no project or user data survives a sign-out. See [sign-out data isolation](../docs/architecture/security-model.md#sign-out-data-isolation-frontend).

## Production image

`Dockerfile` builds the app and serves it from unprivileged nginx (`nginx.conf`): hashed assets are cached for a year, and every other path falls back to `index.html` with `no-cache`. See [container images](../docs/deployment/container-images.md).
