# Architecture

How VibeCraft is put together: the services and what each one owns, how they talk to each other, how the important requests flow end to end, and the decisions behind the shape of it all.

If you are new to the codebase, read these in order:

1. [System context](system-context.md) — the services, their databases, and the external systems they depend on.
2. [Module map](module-map.md) — what lives in each module and package, and the layering rules inside a service.
3. [Service communication](service-communication.md) — the Gateway's route table and the internal service-to-service API.
4. The three request flows that cover almost everything non-trivial:
   - [Authentication](flows/authentication.md) — sign-in, sessions, and how every service trusts them.
   - [AI generation](flows/ai-generation.md) — a chat prompt becoming committed project files.
   - [Live preview](flows/live-preview.md) — a project running in its own Kubernetes pod.

## Reference

| Page | Covers |
|---|---|
| [Security model](security-model.md) | Tenancy, sessions and CSRF, the internal API boundary, untrusted-code isolation, preview access tokens, AI prompt boundaries |
| [File revisions](file-revisions.md) | How every file write is published as an atomic, restorable revision |
| [Cross-cutting concerns](cross-cutting-concerns.md) | Streaming, errors, rate limiting, schema ownership, configuration, observability, deployment topology |
| [Key abstractions](key-abstractions.md) | The handful of domain concepts worth knowing by name |
| [Where do I change…?](where-to-change.md) | A task-oriented index into the code |
| [Architecture decisions](decisions/README.md) | Records of the significant design decisions and their trade-offs |

## Related

- [Data model](../schema/README.md) — entities and tables, per service.
- [API reference](../api/README.md) — every public endpoint and the internal API.
- [Known gaps](../known-gaps/README.md) — the constraints and trade-offs this design accepts today.
