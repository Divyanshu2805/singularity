# Local Development

Everything needed to run VibeCraft on your own machine.

Local development runs **six processes**: Eureka, the three domain services, the Gateway, and the Vite dev server. Postgres and MinIO run in Docker. Live previews additionally need a local Kubernetes cluster — every other feature works without one.

| Step | Page |
|---|---|
| 1. Install the tools and create the accounts you need | [Prerequisites](prerequisites.md) |
| 2. Configure environment variables | [Configuration](configuration.md) |
| 3. Start the stack | [First-time setup](setup.md) |
| 4. (Optional) Run live previews on a local cluster | [Live previews](live-previews.md) |

## Reference

| Page | Covers |
|---|---|
| [Troubleshooting](troubleshooting.md) | Symptoms you're likely to hit, and their fixes |
| [Useful commands](commands.md) | Build, run, test and cluster commands in one place |
| [Health checks](health-checks.md) | The actuator endpoint on each service's management port |
| [Resetting local data](resetting-data.md) | Starting over from empty databases and storage |
| [Working without AI calls](without-ai.md) | Keeping token spend down while developing UI |

Tests are covered in [Testing](../practices/testing.md).
