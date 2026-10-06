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
