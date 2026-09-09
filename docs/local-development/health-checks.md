# Health Checks

Every service — discovery, gateway, account, workspace and intelligence — exposes Spring Boot Actuator's `/actuator/health` on a **separate management port**, `9404` by default (override with `MANAGEMENT_SERVER_PORT`), never on its main port.

```bash
curl http://localhost:9402/actuator/health    # account-service, with the ports from the setup guide
# {"status":"UP"}
```

## Why a separate port

- **It can't be reached through the Gateway or the public tunnel,** because nothing routes to the management port. The Gateway's route table needs no entry for it, and "an unowned path is a 404" stays true for every path the Gateway governs.
- **It answers without authentication**, and exposes only the overall status: `management.endpoints.web.exposure.include: health` with `show-details: never`, so no database, Redis or storage details leak. The security chains also permit it, as a second line of defence.
- **Kubernetes probes** (liveness and readiness) target port `9404` on the pod directly.

## Running several services on one machine

Every service defaults to the same management port. That is fine in Kubernetes, where each pod has its own network, but on one machine the second service to start fails with "Port 9404 was already in use". Give each service its own `MANAGEMENT_SERVER_PORT` — the [setup guide](setup.md#2-start-the-backend) uses `9401`–`9405`.
