# Idea Clarifier

## `IdeaController` (`/api/ideas`)

Runs *before* a project exists — stateless, nothing persisted.

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/api/ideas/clarify` | `{ idea }` | `{ questions: ClarifyingQuestion[] }` | 2–4 questions, entirely model-authored per idea (no fixed question bank — see `docs/architecture/`). Budget scales with how much the idea already says. |
| POST | `/api/ideas/compile` | `{ idea, answers }` | `{ spec }` | Turns idea + answers into a ~3500-char markdown brief. Falls back to a template brief assembled from the raw answers if the AI call fails — never a 500 on a model problem. |

Both bill the caller's daily token usage (`UsageFeature.IDEA_INTERVIEW`), as does the naming call behind `POST /api/projects/from-prompt` (`UsageFeature.PROJECT_NAMING`).
