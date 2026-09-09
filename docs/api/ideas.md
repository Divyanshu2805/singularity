# Ideas

The idea clarifier, which turns a one-line idea into a project brief before any project exists. **Service:** intelligence-service · **Controller:** `IdeaController` (`/api/ideas`)

Both endpoints are stateless — nothing is saved.

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `POST` | `/api/ideas/clarify` | `{ idea }` | `{ questions: ClarifyingQuestion[] }` | 2–4 questions, written by the model for this specific idea (there is no fixed question bank). The more the idea already says, the fewer questions it asks. |
| `POST` | `/api/ideas/compile` | `{ idea, answers }` | `{ spec }` | Turns the idea and answers into a markdown brief of about 3,500 characters. If the AI call fails, falls back to a brief assembled from the raw answers — a model problem is never a `500`. |

Both check the daily token budget first (`402` if spent) and bill usage under the `IDEA_INTERVIEW` feature. Free-text input is capped at 4,000 characters by validation, and only the first 1,500 characters are sent to the model.
