# Domain Vocabulary (Enums)

| Enum | Service | Values | Notes |
|---|---|---|---|
| `ProjectRole` | workspace (a wire copy with the same mapping lives in `common-lib`) | `OWNER`, `EDITOR`, `VIEWER` | Each maps to a `Set<ProjectPermission>` — see below. The two copies must agree. |
| `ProjectPermission` | workspace + `common-lib` | `VIEW`, `EDIT`, `DELETE`, `MANAGE_MEMBERS`, `VIEW_MEMBERS` | `OWNER` → all five. `EDITOR` → `VIEW`/`EDIT`/`DELETE`/`VIEW_MEMBERS` (so an editor *can* trigger a delete — it's just scoped to leaving, not destroying, for everyone but the owner). `VIEWER` → `VIEW`/`VIEW_MEMBERS` only. |
| `PreviewStatus` | workspace | `CREATING`, `RUNNING`, `FAILED`, `TERMINATED` | Stored as `VARCHAR(255)`; no `CHECK`. |
| `SubscriptionStatus` | account | `ACTIVE`, `TRIALING`, `CANCELED`, `PAST_DUE`, `INCOMPLETE` | `getActivePlan` treats `ACTIVE`/`TRIALING`/`PAST_DUE` as still-entitled. |
| `AuthAuditEventType` | account | 13 values (`ACCOUNT_CREATED`, `ACCOUNT_LINKED`, `SIGN_IN`, `SIGN_IN_REJECTED`, `SIGN_OUT`, `SIGN_OUT_EVERYWHERE`, `MFA_ENROLLED`, `MFA_REMOVED`, `PASSWORD_CHANGED`, …), 4 of them (`LEGACY_SIGN_UP`, `LEGACY_SIGN_IN`, `LEGACY_PASSWORD_RESET_REQUESTED`, `LEGACY_PASSWORD_RESET_COMPLETED`) historical-only — kept so old rows still deserialize, never written by anything now | Stored `varchar(64)`. Three values are client-reportable (`MFA_ENROLLED`, `MFA_REMOVED`, `PASSWORD_CHANGED`). |
| `MessageRole` | intelligence | `USER`, `ASSISTANT`, `SYSTEM`, `TOOL` | `ChatMessage.role`. |
| `ChatEventType` | intelligence | `THOUGHT`, `MESSAGE`, `TODO`, `FILE_EDIT`, `FILE_DELETE`, `LEARN`, `TOOL_LOG` | `THOUGHT` is synthesized (elapsed time), not parsed from the model. `FILE_DELETE` is how a rename or move removes the old copy. |
| `UsageFeature` | intelligence | `BUILD`, `BUILD_RETRY`, `EXPLAIN`, `IDEA_INTERVIEW`, `PROJECT_NAMING` | Stored as a plain string on `UsageEvent`, not as this enum. |
