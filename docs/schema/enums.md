# Domain Vocabulary (Enums)

8 enums under `src/main/java/com/java/vibecraft/enums/`:

| Enum | Values | Notes |
|---|---|---|
| `ProjectRole` | `OWNER`, `EDITOR`, `VIEWER` | Each maps to a `Set<ProjectPermission>` — see below. |
| `ProjectPermission` | `VIEW`, `EDIT`, `DELETE`, `MANAGE_MEMBERS`, `VIEW_MEMBERS` | `OWNER` → all five. `EDITOR` → `VIEW`/`EDIT`/`DELETE`/`VIEW_MEMBERS` (so an editor *can* trigger a delete — it's just scoped to leaving, not destroying, for everyone but the owner). `VIEWER` → `VIEW`/`VIEW_MEMBERS` only. |
| `MessageRole` | `USER`, `ASSISTANT`, `SYSTEM`, `TOOL` | `ChatMessage.role`. |
| `ChatEventType` | `THOUGHT`, `MESSAGE`, `TODO`, `FILE_EDIT`, `LEARN`, `TOOL_LOG` | `THOUGHT` is synthesized (elapsed time), not parsed from the model. |
| `PreviewStatus` | `CREATING`, `RUNNING`, `FAILED`, `TERMINATED` | Persisted `@Enumerated(STRING)` — has a live `CHECK` constraint in the dev DB; adding a 5th value means dropping it first. |
| `SubscriptionStatus` | `ACTIVE`, `TRIALING`, `CANCELED`, `PAST_DUE`, `INCOMPLETE` | `getActivePlan` treats `ACTIVE`/`TRIALING`/`PAST_DUE` as still-entitled. |
| `UsageFeature` | `BUILD`, `BUILD_RETRY`, `EXPLAIN`, `IDEA_INTERVIEW`, `PROJECT_NAMING` | Stored as a plain string on `UsageEvent` (not this enum's `@Enumerated` form) — see below. |
| `AuthAuditEventType` | 13 values (`ACCOUNT_CREATED`, `SIGN_IN`, `MFA_ENROLLED`, `LEGACY_SIGN_UP`, …) | Stored `varchar(64)`, no `CHECK` constraint. |
