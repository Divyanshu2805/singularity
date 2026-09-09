# Working Without AI Calls

There is no mock or offline AI mode. Every code-generation, idea-clarifier and code-insight call reaches OpenRouter and spends real tokens against `OPENROUTER_API_KEY`.

To keep costs down while working on UI that doesn't depend on the model's actual output — chat rendering, the build checklist, the teaching-mode layout:

1. Build one project once with a real prompt.
2. Work against its saved history (`GET /api/chat/projects/{projectId}` and `/last-turn-changes`) by reloading the page, instead of sending new prompts for every change.
3. Use a free or low-cost model for development by overriding `spring.ai.openai.chat.options.model` locally.

The backend test suite never calls the model. A fixture-based provider for local development is tracked in [not yet built](../known-gaps/not-yet-built.md).
