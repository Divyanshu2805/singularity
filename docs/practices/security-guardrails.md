# Security Guardrails

Rules no change may break. Each one protects a boundary described in the [security model](../architecture/security-model.md); if a feature seems to need one of them relaxed, raise it for discussion instead of working around it.

1. **Generated code runs only in runner pods.** AI-generated or user-authored project code executes only inside a live-preview Kubernetes pod, reached through the Kubernetes `exec` API — never in-process, never through a local shell.
2. **Code insight stays read-only by construction.** Its model gets exactly one tool (`read_files`); its prompts never mention the `<file>` / `<todo>` / `<learn>` write protocol; and its tools are typed against the read-only `ProjectFileReader`. Don't add a write-capable tool, don't inline file contents into the prompt, and don't widen `ProjectFileReader`.
3. **Replayed history is validated by value.** Any endpoint that replays client-supplied conversation history into a model must treat every role other than `"assistant"` as a user message, not just cap its length.
4. **`/internal/**` requires the internal-service authority.** Every filter chain keeps `requestMatchers("/internal/**").hasAuthority(...)` ahead of `anyRequest()`. Being authenticated is not enough — a user's session cookie authenticates on that path too.
5. **Filters are not accidentally global.** Spring Boot registers every `Filter` bean in the plain servlet chain. A new filter bean needs a disabled `FilterRegistrationBean` (as `InternalServiceAuthFilter` has) or should be constructed by the security chain that uses it instead of being a bean.
6. **Every project file path goes through `ProjectFilePath`.** Stored paths become ZIP entry names and preview-pod file paths, both of which resolve `..`. Never build an object key by string concatenation.
7. **CSRF stays on for cookie sessions.** The only exemptions are callers that structurally cannot send the header: the Stripe webhook and `/internal/**`.
8. **Permission guards sit where the caller is a user.** A service method also called from `/internal/v1` runs as a machine principal, so its user-permission guard belongs on the browser-facing controller. Conversely, every browser-facing path to a service method must be guarded.
9. **Frontend stores clear on sign-out.** A new module-level store with project- or user-specific data registers with `onSignOut(...)` in `frontend/src/lib/session.ts`.
10. **Secrets have no defaults**, and nothing that deploys enables `logging.level.org.springframework.ai.chat.client: DEBUG`, which logs every prompt and response in full.
