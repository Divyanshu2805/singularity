# Working Without Real AI Calls

**There is currently no mock-LLM mode.** Every AI code-generation call, idea-clarifier call, and code-insight call genuinely hits OpenRouter and consumes real tokens against `OPENROUTER_API_KEY` — there is no fixture-replay or stubbed-provider option for local frontend/UI development. If you're iterating on UI that doesn't depend on the model's actual output (e.g. the chat panel's rendering, the build checklist, teaching-mode layout), the cheapest way to develop against real data without repeated generation cost is to build one project once, then work against its already-saved `ChatMessage`/`ChatEvent` history (`GET /api/chat/projects/{projectId}`) rather than re-triggering `POST /api/chat/stream` on every change. A fixture-based or stubbed-`ChatClient` mode would be a genuine improvement here — see `TODO.md`.

The backend's own tests avoid this cost entirely: none of them calls the model.
