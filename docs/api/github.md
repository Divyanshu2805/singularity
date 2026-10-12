# GitHub

Connecting a person's GitHub account, and pushing a project to a repository of theirs. **Service:** workspace-service · **Controllers:** `GitHubController` (`/api/github`) and `ProjectGitHubController` (`/api/projects/{projectId}/github`)

The feature is off unless the deployment has an OAuth app registered (`github.enabled`). Off, every read answers `available: false` and every action is a `409`.

A person's connection needs only a session. A project's standing needs project `VIEW` (any member). Pushing and forgetting the link need `PUBLISH`, which only the **owner** holds. No response ever carries the token.

## A person's connection

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/github` | - | `{ available, connected, login }` | Whether the feature is on, and whether the caller has connected. |
| `POST` | `/api/github/connect` | - | `{ url }` | GitHub's address to send the browser to. It holds a `state` signed for the caller and good for ten minutes. |
| `POST` | `/api/github/callback` | `{ code, state }` | `{ available, connected, login }` | Finishes the sign-in. Called by the app's own page at `/github/callback`, which GitHub redirects to - not by GitHub. `400` when the state is not the caller's or has run out, or GitHub does not take the code; `503` when GitHub cannot be reached. |
| `DELETE` | `/api/github` | - | `204` | Asks GitHub to forget the grant and deletes the stored token. Idempotent, and works when the feature is off. |

## A project's repository

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/github` | - | `ProjectGitHubResponse` | Where the project stands. |
| `POST` | `/github/push` | `{ name?, privateRepo?, message? }` (body optional) | `ProjectGitHubResponse` | **Owner.** Makes the repository the first time - `name` falls back to one made from the project's, and it is private unless `privateRepo` is `false` - then writes the project's files there as one commit. Later pushes ignore `name` and `privateRepo`, and use `message` (at most 300 characters; cut to its first line and 72 characters) as the commit's message, or "Update from Singularity" without one. Answers when the push is done. `400` for a name GitHub's rules refuse or a project with no files; `409` when GitHub is not connected, a push of this project is already running, the name is taken, the repository has gone (the link is removed) or GitHub no longer accepts the token (the connection is removed); `429` past the hourly limit; `503` when GitHub fails. |
| `DELETE` | `/github` | - | `204` | **Owner.** Forgets the link. The repository is not touched. |

### `ProjectGitHubResponse`

| Field | Meaning |
|---|---|
| `available`, `connected`, `login` | As for a person's connection, for the caller. |
| `linked` | The project has a repository. |
| `fullName`, `url`, `privateRepo` | The repository, as GitHub last reported it. |
| `lastPushedAt` | When it was last pushed; `null` for a repository made but not yet pushed to. |
| `hasChanges` | The project has moved since the last push, or has never been pushed to its repository. |
| `suggestedName` | The name a first push would use, when there is no repository yet. |
| `leftOut` | After a push: the files it left out on purpose - environment files and GitHub Actions workflows - at most twenty. Empty on a read. |

## What a push sends

The project's files at one revision, plus a `README.md` and a `.gitignore` when the project has none (the same two the [ZIP download](files.md) adds). The commit's tree is exactly that set: a file deleted from the project is deleted in the repository, and a file changed on GitHub by hand is overwritten.

## Related

[ADR 0010](../architecture/decisions/0010-push-a-project-to-github.md) · [setting it up and checking it by hand](../local-development/github-checklist.md)
