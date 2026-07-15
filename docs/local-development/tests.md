# Running the Backend Test Suite

```bash
./mvnw test -Dtest=IdeaServiceImplTest,LlmResponseParserTest,PromptUtilsTest,CodeSearchScannerTest,MoneyFormatTest,UsageInsightsAssemblerTest,ActiveGenerationTest,CodeInsightPromptsTest,NarrationFilterTest,DurationFormatTest,UsageInsightsServiceImplTest,PreviewPlumbingTest,PreviewReaperTest
```

**A bare `./mvnw test` does not currently pass on a Windows machine reporting the legacy `Asia/Calcutta` timezone alias** — see [Common Problems](troubleshooting.md#common-problems) below. Run the named test classes instead of the whole suite. All 127 backend tests are plain JUnit with no Spring context, so none of them need a running database.

```bash
cd frontend
npm test          # 270 tests across 27 files, vitest
npx tsc --noEmit  # typecheck only
npm run build     # production build — watch for the "chunks larger than 500kB" warning, see TODO.md
```
