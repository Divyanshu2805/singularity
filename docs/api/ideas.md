# Idea Clarifier

## `IdeaController` (`/api/ideas`)

*Owner: `intelligence-service`.* Runs *before* a project exists — stateless, nothing persisted.

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/api/ideas/clarify` | `{ idea }` | `{ questions: ClarifyingQuestion[] }` | 2–4 questions, entirely model-authored per idea (no fixed question bank). Budget scales with how much the idea already says. |
| POST | `/api/ideas/compile` | `{ idea, answers }` | `{ spec }` | Turns idea + answers into a ~3500-char markdown brief. Falls back to a template brief assembled from the raw answers if the AI call fails — never a 500 on a model problem. |

Both check the daily token budget first (402 if spent) and bill the caller's usage (`UsageFeature.IDEA_INTERVIEW`).
