# Domain Vocabulary (Enums)

| Enum | Service | Values | Notes |
|---|---|---|---|
| `ProjectRole` | workspace (a wire copy with the same mapping lives in `common-lib`) | `OWNER`, `EDITOR`, `VIEWER` | Each maps to a `Set<ProjectPermission>` — see below. The two copies must agree. |
| `ProjectPermission` | workspace + `common-lib` | `VIEW`, `EDIT`, `DELETE`, `MANAGE_MEMBERS`, `VIEW_MEMBERS` | `OWNER` → all five. `EDITOR` → `VIEW`/`EDIT`/`DELETE`/`VIEW_MEMBERS` (so an editor *can* trigger a delete — it's just scoped to leaving, not destroying, for everyone but the owner). `VIEWER` → `VIEW`/`VIEW_MEMBERS` only. |
| `PreviewStatus` | workspace | `CREATING`, `RUNNING`, `FAILED`, `TERMINATED` | Stored as `VARCHAR(255)`; no `CHECK`. |
| `RevisionStatus` | workspace | `STAGING`, `APPLIED`, `FAILED`, `CONFLICT` | `PROJECT_FILE_REVISION.status` — see [Revision manifests](conventions.md#revision-manifests). |
| `RevisionSource` | workspace | `AI_GENERATION`, `MANUAL_EDIT`, `RESTORE` | `MANUAL_EDIT` is wired through end to end but has no caller yet — ADDITIONALS.md MID-04. |
| `RevisionChangeType` | workspace | `EDIT`, `DELETE` | `PROJECT_FILE_REVISION_ENTRY.changeType`. |
| `SubscriptionStatus` | account | `ACTIVE`, `TRIALING`, `CANCELED`, `PAST_DUE`, `INCOMPLETE`, `UNPAID`, `PAUSED` | `getActivePlan` treats `ACTIVE`/`TRIALING` as always-entitled and `PAST_DUE` as entitled only within `billing.past-due-grace-days` of `pastDueSince`; `UNPAID`/`PAUSED` never entitle (see SUBSCRIPTION / PLAN above). |
| `WebhookEventStatus` | account | `RECEIVED`, `PROCESSED` | `RECEIVED` covers both in-flight and a handler that threw; both are reclaimable by a webhook retry. |
| `AuthAuditEventType` | account | `ACCOUNT_CREATED`, `ACCOUNT_LINKED`, `SIGN_IN`, `SIGN_IN_REJECTED`, `SIGN_OUT`, `SIGN_OUT_EVERYWHERE`, `MFA_ENROLLED`, `MFA_REMOVED`, `PASSWORD_CHANGED` | Stored `varchar(64)`. Three values are client-reportable (`MFA_ENROLLED`, `MFA_REMOVED`, `PASSWORD_CHANGED`). |
| `MessageRole` | intelligence | `USER`, `ASSISTANT`, `SYSTEM`, `TOOL` | `ChatMessage.role`. |
| `ChatEventType` | intelligence | `THOUGHT`, `MESSAGE`, `TODO`, `FILE_EDIT`, `FILE_DELETE`, `LEARN`, `TOOL_LOG` | `THOUGHT` is synthesized (elapsed time), not parsed from the model. `FILE_DELETE` is how a rename or move removes the old copy. |
| `UsageFeature` | intelligence | `BUILD`, `BUILD_RETRY`, `EXPLAIN`, `IDEA_INTERVIEW`, `PROJECT_NAMING` | Stored as a plain string on `UsageEvent`, not as this enum. |
