# Ideas

The idea clarifier, which turns a one-line idea into a project brief before any project exists. **Service:** intelligence-service · **Controller:** `IdeaController` (`/api/ideas`)

Both endpoints are stateless — nothing is saved.

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `POST` | `/api/ideas/clarify` | `{ idea }` | `{ questions: ClarifyingQuestion[], tailored }` | 0–5 questions. The model decides how many this idea needs and writes each one for it; an idea that already settles everything gets an empty list, and the client goes straight to building. `tailored` is `false` when the model could not be reached: `questions` is then a fixed general set, and the client must say so rather than present them as written for the idea. |
| `POST` | `/api/ideas/compile` | `{ idea, answers }` | `{ spec }` | Turns the idea and answers into a markdown brief of about 3,500 characters. If the AI call fails, falls back to a brief assembled from the raw answers — a model problem is never a `500`. |

A failed AI call is never a `500` on either endpoint, but it is never silent either: it is logged as an error naming the cause (a rejected provider key and an account out of credit are called out by name), and `clarify` reports it through `tailored`.

Both check the daily token budget first (`402` if spent) and bill usage under the `IDEA_INTERVIEW` feature. Free-text input is capped at 4,000 characters by validation, and only the first 1,500 characters are sent to the model.
