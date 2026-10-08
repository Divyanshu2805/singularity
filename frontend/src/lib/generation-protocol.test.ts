/**
 * Covers the browser's reading of the build chat's tagged text.
 *
 * The first half runs the cases the server's parser runs
 * (`intelligence-service/src/test/resources/protocol/cases.json`, read by `GenerationProtocolCasesTest`). That is the
 * point of the file: the two parsers once disagreed about a file holding `useState<Todo[]>`, so the chat showed a file
 * as written that the server had discarded. A new rule goes into that file first.
 *
 * The second half covers what only the browser does, because only it sees the text while it is still arriving: a
 * block that has not closed yet is shown as in progress, nothing after it is shown at all, a half-arrived tag is never
 * revealed as prose, and the files a turn has written so far are read off the same events the chat renders.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findSafeEnd, findVisibleRanges, normalizePath, parseGenerationText, scanProtocol, turnFiles } from "./generation-protocol";
import { ChatEventType } from "./types";

interface SharedCase {
  name: string;
  input: string;
  events: { type: string; content: string; path?: string; metadata?: string }[];
  cutOff?: { type: string; path?: string };
  rejectedPaths?: string[];
}

const TAG_TYPES: Record<string, string> = {
  message: "MESSAGE",
  file: "FILE_EDIT",
  edit: "FILE_PATCH",
  delete: "FILE_DELETE",
  tool: "TOOL_LOG",
  todo: "TODO",
  learn: "LEARN",
  ask: "ASK",
  approach: "THINKING",
  think: "THINKING",
};

const sharedCases = JSON.parse(
  readFileSync(resolve(process.cwd(), "../intelligence-service/src/test/resources/protocol/cases.json"), "utf-8")
) as SharedCase[];

const visibleText = (raw: string) => findVisibleRanges(raw).map(([start, end]) => raw.slice(start, end));

describe("the protocol's shared cases", () => {
  it("are all there", () => {
    expect(sharedCases.length).toBeGreaterThan(30);
  });

  it.each(sharedCases.map((testCase) => [testCase.name, testCase] as const))("%s", (_name, testCase) => {
    const events = parseGenerationText(testCase.input, { streaming: false });

    expect(events.map((event) => ({
      type: event.type,
      content: event.content,
      ...(event.filePath !== undefined ? { path: event.filePath } : {}),
      ...(event.metadata !== undefined ? { metadata: event.metadata } : {}),
    }))).toEqual(testCase.events);
    expect(events.every((event) => event.isComplete === true)).toBe(true);
  });

  it.each(sharedCases.map((testCase) => [testCase.name, testCase] as const))("agrees on where it was cut off: %s", (_name, testCase) => {
    const { blocks, dangling } = scanProtocol(testCase.input);
    const endsMidBlock = !!dangling && !blocks.some((block) => block.start > dangling.start);

    expect(endsMidBlock).toBe(!!testCase.cutOff);
    if (testCase.cutOff && dangling) {
      expect(TAG_TYPES[dangling.tag]).toBe(testCase.cutOff.type);
      expect(normalizePath(dangling.attributes.path)).toBe(testCase.cutOff.path);
    }
  });
});

describe("a change to part of a file", () => {
  const block = "<<<<<<< SEARCH\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> REPLACE\n";

  it("is a path that was edited, never a file's content", () => {
    const events = parseGenerationText(`<edit path="src/a.ts">\n${block}</edit><file path="src/b.ts">const b = 1;</file>`, { streaming: true });
    const files = turnFiles(events);

    expect(files.edited).toEqual(["src/a.ts"]);
    expect([...files.written.keys()]).toEqual(["src/b.ts"]);
    expect(files.arriving).toBeNull();
  });

  it("is in progress while it arrives, and is not yet counted as edited", () => {
    const events = parseGenerationText('<edit path="src/a.ts">\n<<<<<<< SEARCH\nconst a', { streaming: true });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: ChatEventType.FILE_PATCH, filePath: "src/a.ts", isComplete: false });
    expect(turnFiles(events).edited).toEqual([]);
    expect(turnFiles(events).arriving).toBeNull();
  });

  it("names a path once however many edits it had", () => {
    const events = parseGenerationText(`<edit path="src/a.ts">\n${block}</edit><edit path="src/a.ts">\n${block}</edit>`, { streaming: false });

    expect(events).toHaveLength(2);
    expect(turnFiles(events).edited).toEqual(["src/a.ts"]);
  });

  it("keeps the marker lines out of the prose the chat reveals", () => {
    expect(findVisibleRanges(`<message>Hi.</message><edit path="src/a.ts">\n${block}</edit>`)).toHaveLength(1);
    expect(findSafeEnd('<message>Done.</message><ed')).toBe(24);
  });
});

describe("a block that is still arriving", () => {
  it("is shown as in progress, with what has arrived of it", () => {
    const events = parseGenerationText('<file path="a.tsx">export const x = 1;\nconst partial', { streaming: true });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: ChatEventType.FILE_EDIT, filePath: "a.tsx", isComplete: false, content: "export const x = 1;\nconst partial" });
  });

  it("holds a generic inside a half-written file as content, not as a checklist step", () => {
    const events = parseGenerationText(
      '<todo path="src/hooks/useTodos.ts">Creating the hook</todo><file path="src/hooks/useTodos.ts">const [todos] = useState<Todo[]>(',
      { streaming: true }
    );

    expect(events.map((event) => event.type)).toEqual([ChatEventType.TODO, ChatEventType.FILE_EDIT]);
    expect(events[1]).toMatchObject({ isComplete: false, content: "const [todos] = useState<Todo[]>(" });
  });

  it("is complete the moment its closing tag is in, and ends with a line break like the saved file will", () => {
    const [file] = parseGenerationText('<file path="a.tsx">export const x = 1;</file>', { streaming: true });

    expect(file).toMatchObject({ isComplete: true, content: "export const x = 1;\n" });
  });

  it("hides everything after it, since nothing after an unclosed block can be trusted yet", () => {
    const raw = '<message>Plan.</message><file path="a.ts">never closed<message>Done.</message>';

    expect(parseGenerationText(raw, { streaming: true }).map((event) => event.type)).toEqual([ChatEventType.MESSAGE, ChatEventType.FILE_EDIT]);
    expect(parseGenerationText(raw, { streaming: false }).map((event) => event.content)).toEqual(["Plan.", "Done."]);
  });

  it("reports a lesson, a question and a message in progress the same way", () => {
    const lesson = parseGenerationText('<file path="a.tsx">x</file><learn path="a.tsx"><summary>JSX lets you', { streaming: true });
    const question = parseGenerationText('<ask options="Yes|No">Should it have a dark', { streaming: true });
    const message = parseGenerationText("<message>Working on the na", { streaming: true });

    expect(lesson[1]).toMatchObject({ type: ChatEventType.LEARN, content: "<summary>JSX lets you", isComplete: false });
    expect(question[0]).toMatchObject({ type: ChatEventType.ASK, isComplete: false });
    expect(message[0]).toMatchObject({ type: ChatEventType.MESSAGE, content: "Working on the na", isComplete: false });
  });

  it("reports the model's working-out as it arrives, ahead of everything else", () => {
    const thinking = parseGenerationText("<think>One page, so no rou", { streaming: true });
    const settled = parseGenerationText("<think>One page, so no router.</think><message>Starting", { streaming: true });

    expect(thinking).toMatchObject([{ type: ChatEventType.THINKING, content: "One page, so no rou", isComplete: false }]);
    expect(settled).toMatchObject([
      { type: ChatEventType.THINKING, content: "One page, so no router.", isComplete: true },
      { type: ChatEventType.MESSAGE, content: "Starting", isComplete: false },
    ]);
  });

  it("is not shown at all when the answer is over and it never closed", () => {
    expect(parseGenerationText('<message>Plan.</message><file path="a.tsx">half a file', { streaming: false })).toHaveLength(1);
  });
});

describe("lessons in the stream", () => {
  it("keeps a walkthrough's own markup whole", () => {
    const body = '<summary>The app.</summary><part><code><button type="button"></code>A button.</part>';
    const [, lesson] = parseGenerationText(`<file path="src/App.tsx">x</file><learn path="src/App.tsx">${body}</learn>`, { streaming: true });

    expect(lesson).toEqual({ type: ChatEventType.LEARN, content: body, filePath: "src/App.tsx", metadata: undefined, isComplete: true });
  });

  it("reads the concept on a one-sentence lesson's tag", () => {
    const [, lesson] = parseGenerationText('<file path="a.tsx">x</file><learn path="a.tsx" concept=" Props ">Props are inputs.</learn>', { streaming: true });

    expect(lesson.metadata).toBe("Props");
  });
});

describe("what the reveal may show", () => {
  it("leaves out the model's working-out, which the chat shows a step at a time instead of typing", () => {
    expect(visibleText("<approach>No router needed.</approach><message>Starting")).toEqual(["Starting"]);
    expect(visibleText("<think>No router needed.</think><message>Starting")).toEqual(["Starting"]);
    expect(visibleText("<think>No rou")).toEqual([]);
    expect(findSafeEnd("<think>No router needed.</thi")).toBe("<think>No router needed.".length);
  });

  it("is only message prose - never a file, a lesson, a delete reason or a question", () => {
    const raw = '<message>Plan.</message><file path="a.tsx">const x = 1;</file><learn path="a.tsx"><summary>A lesson.</summary></learn>'
      + '<delete path="src/Old.tsx">Replaced</delete><ask options="A|B">Which?</ask><message>Done';

    expect(visibleText(raw)).toEqual(["Plan.", "Done"]);
  });

  it("is not fooled by a generic inside a file into revealing the rest of the file as prose", () => {
    const raw = '<message>Plan.</message><file path="a.ts">const a = useState<Message[]>([]);\nexport default a;</file>';

    expect(visibleText(raw)).toEqual(["Plan."]);
  });

  it("stops short of a tag that has only half arrived", () => {
    expect(findSafeEnd("<message>Done.</message><lea")).toBe("<message>Done.</message>".length);
    expect(findSafeEnd('<learn path="a.tsx">Props are inputs.</lea')).toBe('<learn path="a.tsx">Props are inputs.'.length);
    expect(findSafeEnd("Done <dele")).toBe(5);
    expect(findSafeEnd("<message>ok</message><as")).toBe("<message>ok</message>".length);
    expect(findSafeEnd('<message>ok</message><file path="a')).toBe("<message>ok</message>".length);
  });

  it("does not hold back text that cannot become a tag", () => {
    expect(findSafeEnd("a < b and c")).toBe("a < b and c".length);
    expect(findSafeEnd("const x = useState<Tod")).toBe("const x = useState<Tod".length);
    expect(findSafeEnd("<message>all in</message>")).toBe("<message>all in</message>".length);
  });
});

describe("the files a turn has written so far", () => {
  const read = (raw: string) => turnFiles(parseGenerationText(raw, { streaming: true }));

  it("lists finished files with their content, the one still arriving, and what was deleted", () => {
    const files = read(
      '<todo path="src/a.ts">One</todo><todo path="src/b.ts">Two</todo><file path="src/a.ts">export const a = 1;</file>'
      + '<delete path="src/old.ts">gone</delete><file path="src/b.ts">export const b'
    );

    expect([...files.written]).toEqual([["src/a.ts", "export const a = 1;\n"]]);
    expect([...files.deleted]).toEqual(["src/old.ts"]);
    expect(files.arriving).toEqual({ path: "src/b.ts", content: "export const b" });
    expect(files.plannedPaths).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("treats two spellings of one path as the same file", () => {
    const files = read('<todo path="./src/a.ts">One</todo><file path="/src/a.ts">export const a = 1;</file>');

    expect(files.plannedPaths).toEqual(["src/a.ts"]);
    expect(files.written.has("src/a.ts")).toBe(true);
  });

  it("has nothing for a turn that only talked", () => {
    const files = read("<message>Routing lives in App.tsx.</message>");

    expect(files.written.size).toBe(0);
    expect(files.arriving).toBeNull();
  });
});
