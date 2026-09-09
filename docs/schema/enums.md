# Enums

Every enum is stored as a plain string column with no `CHECK` constraint, so adding a value needs no migration. See [conventions](conventions.md#enum-columns-carry-no-check-constraint).

## Roles and permissions

`ProjectRole` lives in workspace-service, with a wire copy in `common-lib` that must use the same mapping. Each role maps to a set of `ProjectPermission`s:

| Role | `VIEW` | `VIEW_MEMBERS` | `EDIT` | `DELETE` | `MANAGE_MEMBERS` |
|---|:---:|:---:|:---:|:---:|:---:|
| `OWNER` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `EDITOR` | ✓ | ✓ | ✓ | ✓ | |
| `VIEWER` | ✓ | ✓ | | | |

An editor's `DELETE` removes only their own membership; only the owner's delete removes the project for everyone.

## account-service

| Enum | Values | Notes |
|---|---|---|
| `SubscriptionStatus` | `ACTIVE`, `TRIALING`, `CANCELED`, `PAST_DUE`, `INCOMPLETE`, `UNPAID`, `PAUSED` | `ACTIVE` and `TRIALING` always entitle; `PAST_DUE` entitles only within `billing.past-due-grace-days`; the rest never do. See [`SUBSCRIPTION`](account-service.md#subscription--plan). |
| `WebhookEventStatus` | `RECEIVED`, `PROCESSED` | `RECEIVED` covers both in-flight and a handler that threw; both can be reclaimed by a retry. |
| `AuthAuditEventType` | `ACCOUNT_CREATED`, `ACCOUNT_LINKED`, `SIGN_IN`, `SIGN_IN_REJECTED`, `SIGN_OUT`, `SIGN_OUT_EVERYWHERE`, `MFA_ENROLLED`, `MFA_REMOVED`, `PASSWORD_CHANGED` | The last three can be reported by the client. |

## workspace-service

| Enum | Values | Notes |
|---|---|---|
| `PreviewStatus` | `CREATING`, `RUNNING`, `FAILED`, `TERMINATED` | |
| `RevisionStatus` | `STAGING`, `APPLIED`, `FAILED`, `CONFLICT` | See [File revisions](../architecture/file-revisions.md). |
| `RevisionSource` | `AI_GENERATION`, `MANUAL_EDIT`, `RESTORE` | `MANUAL_EDIT` is supported end to end but nothing produces it yet. |
| `RevisionChangeType` | `EDIT`, `DELETE` | |

## intelligence-service

| Enum | Values | Notes |
|---|---|---|
| `MessageRole` | `USER`, `ASSISTANT`, `SYSTEM`, `TOOL` | |
| `ChatEventType` | `THOUGHT`, `MESSAGE`, `TODO`, `FILE_EDIT`, `FILE_DELETE`, `LEARN`, `TOOL_LOG` | `THOUGHT` is synthesized (elapsed time), not parsed from the model. A rename or move is a `FILE_EDIT` plus a `FILE_DELETE` of the old path. |
| `UsageFeature` | `BUILD`, `BUILD_RETRY`, `EXPLAIN`, `IDEA_INTERVIEW`, `PROJECT_NAMING` | Stored on `UsageEvent` as a plain string column, not as this enum. |
