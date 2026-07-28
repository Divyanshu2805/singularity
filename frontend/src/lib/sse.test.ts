/**
 * Covers the incremental Server-Sent Events parser: events split across chunks, an event's several data lines joined
 * into one payload with the newlines intact, named events, and comment lines ignored.
 *
 * The join is the point: reading each data line as its own chunk silently deleted every newline the model wrote.
 */
import { describe, expect, it } from "vitest";
import { createSseParser, type SseEvent } from "./sse";

function parse(...pieces: string[]) {
  const events: SseEvent[] = [];
  const parser = createSseParser((event) => events.push(event));
  pieces.forEach((piece) => parser.push(piece));
  parser.end();
  return events;
}

describe("createSseParser", () => {
  it("joins the data lines of one event with newlines, which is how Spring sends a chunk containing line breaks", () => {
    const events = parse("data:returns:\ndata:1. A layout\n\n");

    expect(events).toEqual([{ event: "message", data: "returns:\n1. A layout" }]);
  });

  it("keeps a chunk that is only line breaks", () => {
    expect(parse("data:\ndata:\ndata:\n\n")).toEqual([{ event: "message", data: "\n\n" }]);
  });

  it("reassembles the original text across many events", () => {
    const text = parse(
      "data:That snippet is the app shell:\n\n",
      "data:\ndata:\ndata:\n\n",
      "data:1. **A column layout**\ndata:2. A sticky header\n\n"
    ).map((event) => event.data).join("");

    expect(text).toBe("That snippet is the app shell:\n\n1. **A column layout**\n2. A sticky header");
  });

  it("keeps the space after data:, because it belongs to the text", () => {
    expect(parse("data: sets up\n\n")[0].data).toBe(" sets up");
  });

  it("handles a network read that splits a line in two", () => {
    expect(parse("da", "ta:hel", "lo\n", "\n")).toEqual([{ event: "message", data: "hello" }]);
  });

  it("reads named events and resets the name after each one", () => {
    const events = parse("event:error\ndata:Rate limited\n\ndata:next\n\n");

    expect(events).toEqual([
      { event: "error", data: "Rate limited" },
      { event: "message", data: "next" },
    ]);
  });

  it("accepts CRLF line endings and ignores comments", () => {
    expect(parse(": keep-alive\r\ndata:hi\r\n\r\n")).toEqual([{ event: "message", data: "hi" }]);
  });

  it("delivers a final event that never got its blank line", () => {
    expect(parse("data:last words")).toEqual([{ event: "message", data: "last words" }]);
  });
});
