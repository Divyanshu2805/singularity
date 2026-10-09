# Constraints and Trade-offs

Structural limits of the current design. None of them is a problem at today's scale; each one shapes *how* the system would have to change to grow.

## Some state is per process, not per system

Each service keeps its own `SessionCache` and `RateLimiter` counters; workspace-service keeps the per-project preview lock; intelligence-service keeps the registry of running generations. With one instance of each service, that is correct. As soon as a service runs more than one instance:

- a user's rate-limit budget is multiplied by the instance count;
- a sign-out eviction reaches only the instances Eureka lists (each cache still expires on its own within 60 seconds);
- the preview lock no longer serializes starts and stops — it would need a distributed lock, such as Redis `SET NX`;
- a running generation can only be re-attached on the instance running it, and "one generation per project" is only enforced within an instance.

## Consistency across services is best-effort

There are no cross-database transactions and no foreign keys across services. A project deleted in workspace-service leaves its chat and usage rows in intelligence-service (usage insights read deleted projects on purpose), and a crash between two services' writes can leave one ahead of the other. Where it matters, writes are ordered so the failure is benign — for example, the sign-out eviction runs only after the revocation is recorded.

## CORS is intentionally not configured

The browser only ever talks to one origin: the Gateway in production, and the Vite dev server in development (which proxies `/api` and strips `Origin`). No service configures CORS. If the frontend were ever served from a different origin than the API, the right place for it would be a single `globalcors` rule on the Gateway, not per-service configuration.

## Previews share a registered domain with the app

In production the app is `singularity.divyanshuagrahari.dev` and previews are `*.divyanshuagrahari.dev`, so a browser treats them as the same *site*: `SameSite=Strict` does not separate them, and a preview page can set cookies on the shared parent domain. The `__Host-` prefix on the session and CSRF cookies stops those cookies being overwritten, but the clean fix is to serve previews from a different registered domain (the preview cookie, the CSP frame origins, the cloudflared wildcard and `preview-public-domain` all follow from it).

## Published apps share that domain too

Published apps are served from `<name>.divyanshuagrahari.dev`, one label under the same registered domain as the app and the previews, for the same reason (the free wildcard certificate covers a single level). The [security model](../architecture/security-model.md#published-apps-and-the-shared-domain) goes through what that allows - a page can set cookies for the whole site, which can make the app unusable in that browser, and can imitate the product - and decides: acceptable while the audience is the owner's own, a domain of their own before it is not, and a configuration change when the time comes.

## A build saved while its preview is starting

A build request starts the project's preview, and the build's files are copied into the runner when the build is saved. If that copy lands in the first second or two after the dev server comes up, the page in the Preview tab can come up blank or on the starter template's placeholder, and stays that way until Reload is pressed. A real build takes long enough that this is rare; the browser journey test, whose scripted model builds in two seconds, sees it about one run in ten and presses Reload when it does.

The panel reloads the frame by itself in one of the two forms this takes. The whole fix is on the server: do not copy a revision into a runner whose dev server has not finished starting, or start the dev server only after the newest revision is in place. It touches `PreviewBootstrapper` and `PreviewSynchronizer`, so it needs `PreviewPipelineIT` and the preview checklist, and was left out of the work that found it. See [pitfalls](../practices/gotchas/kubernetes.md#a-build-that-lands-while-the-dev-server-is-starting).

## Previews are single-stack

Live previews support React + Vite projects. The pod pool, bootstrapper and routing are almost entirely stack-agnostic; only the runner image, the start-up script, the readiness probe (`/@vite/client`) and the port are specific to Vite. Supporting another stack is a change to those four pieces, not to the pipeline.

Until then every project is React + TypeScript on Vite, created from one starter template, and the build prompt says so: asked for another framework or language, the model writes nothing and asks whether to build the same thing in React; asked for something that needs a server, it builds the front end with its data in the browser and says what is simulated. See [the stack, and requests outside it](../architecture/flows/ai-generation.md#the-stack-and-requests-outside-it).

## The daily allowance is enforced on an estimate, by one instance

While a reply is being written its cost is estimated at four characters a token, since the provider reports the real figure only when the call ends. A turn stopped at the limit is therefore charged that estimate, which can be a little over or under what the provider would have billed, and the meter is capped at the limit so it never reads past it. The holds that keep two calls from claiming the same room are in memory, so they are only shared within one instance of intelligence-service - which a turn in progress already requires.

## One machine in production

Everything runs on a single node. Losing it means restoring from the nightly backup onto a new machine (about 1–2 hours), and preview start-ups compete with the services for two CPU cores. See [risks and growth](../deployment/risks-and-growth.md).

## The highest-risk paths are verified by hand

Stripe billing has no end-to-end automated test and is verified manually. The live-preview pipeline has one — `PreviewPipelineIT`, run by CI on a kind cluster — which covers the server and proxy side; what the Preview tab itself does in a browser, and the cases that need two people or a long wait, are still verified by hand. See [testing](../practices/testing.md#what-automated-tests-dont-cover) and the [preview checklist](../local-development/preview-checklist.md).
