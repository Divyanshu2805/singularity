# Working Without AI Calls

intelligence-service has a scripted model behind the `stub-ai` Spring profile. With it on, no provider is contacted and no key is needed; every call runs its real code path - parsing, the edit, syntax and import checks, saving, metering - against a reply that costs nothing.

```bash
./mvnw -pl common-lib,intelligence-service compile spring-boot:run -Dspring-boot.run.profiles=stub-ai
```

The service logs a warning at start-up saying the profile is on. Nothing that deploys sets it.

| Call | What the stub answers |
|---|---|
| A first build | A small working notes app: three new files, and an edit naming the page when the project is fresh from the template |
| The next request | One new component and an edit to the page |
| Any request after that | A message saying there is nothing left to script |
| A request naming another stack (Vue, Python...) | A question: build it in React? |
| A short question | One message |
| The idea interview and its brief | Two questions; a fixed brief |
| A step lesson, a turn's big picture, an explanation, suggestions | Fixed text in the shape each parser reads |
| A project tour, a glossary entry, a lesson's task, the check of a task | Fixed text in the shape each reader expects; the check always says `Done`, since the stub reads no file |

The reply is streamed in small pieces (`ai.stub.chunk-delay`, 12 ms each by default), so the chat fills in the way a real one does. Token usage is reported as characters over four, so the meter and the daily allowance move.

The scripted replies live in `llm/stub/StubReplies` and are written against the project the call was shown, not from a fixed script: an edit is only written when the lines it searches for are there. `StubBuildTurnTest` runs them through whole turns on the real starter template.

## When the model's own output matters

For UI that depends on what a real model writes, build one project once with a real prompt and work against its saved history (`GET /api/chat/projects/{projectId}`) by reloading the page. To measure a real model, see [the build benchmark](../practices/testing.md#the-build-benchmark).
