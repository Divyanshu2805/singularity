# Prerequisites

## Tools

| Tool | Version | Used for |
|---|---|---|
| JDK | 25 | The backend services |
| Maven | — | Use the bundled wrapper (`./mvnw`, or `mvnw.cmd` on Windows); don't install Maven separately |
| Node.js and npm | 20 or newer | The frontend and the preview proxy. `package-lock.json` is the lockfile in use |
| Docker | Recent, with Compose | PostgreSQL and MinIO (`services.docker-compose.yml`) |
| kind and kubectl | Recent | **Optional** — only for [live previews](live-previews.md) |

## Accounts and keys

| Service | Needed for | What you need |
|---|---|---|
| [Firebase](https://console.firebase.google.com/) | Signing in (required) | A project with Authentication enabled, a service-account key for the backend, and the web-app config for the frontend |
| [OpenRouter](https://openrouter.ai/) | Every AI feature (required) | An API key |
| [Stripe](https://dashboard.stripe.com/test) | Billing only (optional) | Test-mode API keys, a webhook signing secret, and two recurring prices (Pro, Business) |

Without Stripe keys, everything except checkout works: the Free plan and its limits are seeded regardless.

Next: [configuration](configuration.md).
