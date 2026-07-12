import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

// Byte for byte what Spring MVC wrote for the chunks "returns:\n1. A", "\n\n", "### Head\n- item" and " lead"
// (captured from a real SseEmitter): a newline inside a chunk becomes a new data: line of the same event.
const SPRING_FRAMES = "data:returns:\ndata:1. A\n\ndata:\ndata:\ndata:\n\ndata:### Head\ndata:- item\n\ndata: lead\n\n";

function streamOf(text: string, pieceSize: number) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += pieceSize) controller.enqueue(bytes.slice(i, i + pieceSize));
      controller.close();
    },
  });
}

function respondWith(body: string, pieceSize: number) {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(streamOf(body, pieceSize), { status: 200, headers: { "Content-Type": "text/event-stream" } })
  ));
}

function collect() {
  return new Promise<string>((resolve, reject) => {
    let text = "";
    api.streamCodeInsight("1", "ask", {}, (chunk) => { text += chunk; }, () => resolve(text), reject);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api.streamCodeInsight", () => {
  it.each([1, 7, 1000])("keeps every line break the backend sent, whatever size the network pieces are (%i bytes)", async (pieceSize) => {
    respondWith(SPRING_FRAMES, pieceSize);

    await expect(collect()).resolves.toBe("returns:\n1. A\n\n### Head\n- item lead");
  });

  it("turns a named error event into a failure", async () => {
    respondWith("data:partial\n\nevent:error\ndata:The AI provider is rate-limited.\n\n", 5);

    await expect(collect()).rejects.toThrow("The AI provider is rate-limited.");
  });
});
