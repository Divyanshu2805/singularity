# Configuration

## Backend

Copy the template and fill it in:

```bash
cp .env.example .env
```

`.env` lives at the repository root and is gitignored. Every service loads it automatically (`spring.config.import: optional:file:.env[.properties]`). Each value is a bare placeholder in `application.yaml` with **no default**, so a missing value fails start-up rather than running insecurely.

| Variable | Required | Purpose |
|---|---|---|
| `DB_USERNAME`, `DB_PASSWORD` | Yes | PostgreSQL credentials. The template's defaults match `services.docker-compose.yml`. |
| `FIREBASE_PROJECT_ID` | Yes | The Firebase project the backend verifies tokens against. |
| `FIREBASE_CREDENTIALS_PATH` | Yes | Path to the Firebase service-account JSON key. Keep it **outside** the repository — it can mint tokens for any user. |
| `OPENROUTER_API_KEY` | Yes | Every AI call: generation, the idea clarifier, code insight. |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | Yes | Object storage for project files. The template's defaults match `services.docker-compose.yml`. |
| `INTERNAL_SERVICE_SHARED_SECRET` | Yes | The only credential the `/internal/v1` API accepts. Any long random string, identical for every service. |
| `PREVIEW_ACCESS_TOKEN_SECRET` | For previews | Signs preview access tokens. Must equal the preview proxy's secret exactly, or every preview link returns `401`. |
| `STRIPE_SECRET` | For billing | Stripe test-mode secret key. |
| `STRIPE_WEBHOOK_SECRET` | For billing | From `stripe listen --forward-to localhost:8000/webhooks/payment`, or a configured endpoint. |
| `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` | For billing | Recurring price ids for the two paid plans. `PlanSeeder` upserts the plan catalogue against them on every start. |

Non-secret settings — ports, the Redis host, preview timeouts, the AI model — live in each service's `application.yaml` and can be overridden with standard Spring environment variables.

### Build turn limits

How long a build turn may wait, and how hard it tries, is `generation.*` in intelligence-service's `application.yaml`. Each can be overridden like any Spring property (`GENERATION_IDLE_TIMEOUT=30s`).

| Property | Default | Meaning |
|---|---|---|
| `generation.idle-timeout` | `3m` | Silence on the model's stream before that call is abandoned |
| `generation.attempt-timeout` | `10m` | The longest one call to the model may run |
| `generation.turn-timeout` | `20m` | The longest a whole turn may run, across every call it makes |
| `generation.busy-pause` | `4s` | The first wait after the provider answers `429`; it grows with each retry |
| `generation.max-continuations` | `2` | How many times a reply that stopped early is carried on |
| `generation.max-repairs` | `3` | How many times the model is asked to repair what a check of the written files found: an edit that could not be applied, a file that does not parse, an import that does not resolve, an error from the compiler |

What each one does to a turn is in the [AI generation flow](../architecture/flows/ai-generation.md#in-turn-recovery).

### Which model each kind of call uses

Every call uses `spring.ai.openai.chat.options.model` unless its kind says otherwise. Each kind takes a model and a reasoning effort (`ai.calls.<kind>.model`, `ai.calls.<kind>.reasoning-effort`); a kind that sets neither runs as before.

| Kind | What it is | Set by default |
|---|---|---|
| `build` | Writing a build turn's reply, or carrying one on | — |
| `repair` | Mending what a check of the written files found | — |
| `interview` | The idea interview and its brief | — |
| `lesson` | A step lesson | `reasoning-effort: low` |
| `explain` | An explanation or a question about code | — |
| `suggest` | The next steps offered under a finished build | — |

Reasoning effort is most of the wait for a reply's first word: a model that reasons first sends nothing while it does. Measured on `gemini-3.8-flash` over the twenty benchmark prompts, `ai.calls.build.reasoning-effort=low` took a first build's first word from 9.1 s to 2.4 s with the same twenty of twenty right. The values are the provider's own (`none`, `minimal`, `low`, `medium`, `high`), and a provider refuses one it does not know on the first call - so check a new value with one real turn before deploying it.

### The code check in the preview

Before a build turn is saved, workspace-service type-checks its files in the project's running preview pod (`preview.check.*`). It fails open: no preview, a slow pod or a cluster that cannot be reached means the turn is saved on the static checks alone.

| Property | Default | Meaning |
|---|---|---|
| `preview.check.enabled` | `true` | Whether the check runs at all |
| `preview.check.timeout` | `40s` | The longest the whole check may take before the turn is saved unchecked |
| `preview.check.max-files` | `80` | A turn that wrote more files than this is not checked |
| `preview.check.max-total-chars` | `600000` | Nor one whose files are larger than this together |
| `preview.check.max-problems` | `12` | How many problems are sent back to the model |
| `preview.check.max-new-packages` | `8` | How many newly added packages are looked up in the npm registry |


### Using Gemini instead of OpenRouter

The AI client speaks the OpenAI API and is pointed at OpenRouter only by configuration, so Google's OpenAI-compatible endpoint works with these lines in `.env` (the key variable keeps its name, only its value changes):

```properties
OPENROUTER_API_KEY=<your Gemini API key>
spring.ai.openai.base-url=https://generativelanguage.googleapis.com/v1beta/openai
spring.ai.openai.chat.completions-path=/chat/completions
spring.ai.openai.chat.options.model=<a Gemini model id from ai.google.dev/gemini-api/docs/models>
```

Gemini 3 models reject the request that follows a tool call unless it carries the hidden "thought signature" they attached to the call, and the AI library does not send it back. `GeminiToolCallCompat` (intelligence-service) adds Google's documented bypass value to every tool call, but only while `base-url` points at Google. Without it every build that reads a file fails with `400 Function call is missing a thought_signature`, while the idea interview, which uses no tools, still works. Reasoning carried between tool steps may be slightly weaker than with real signatures.

## Frontend

```bash
cd frontend
cp .env.example .env.local
```

| Variable | Required | Purpose |
|---|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | Yes | The Firebase web-app config (Firebase console → Project settings → Your apps). Not secrets. |
| `VITE_CSP_FRAME_ORIGINS` | Production builds | Space-separated origins previews are served from, allowed in the Content Security Policy's `frame-src`. |
| `VITE_PAYMENTS_TEST_MODE` | Production builds | `true` shows a "Stripe test mode" notice on the pricing and billing pages. |

Vite inlines these into the bundle at build time.

## Never commit

`.env`, `.env.local`, and the Firebase service-account key. `.gitignore` covers the first two; keep the key outside the repository entirely.

Next: [first-time setup](setup.md).
