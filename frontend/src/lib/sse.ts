export interface SseEvent {
  /** The `event:` name, or "message" when the event didn't set one. */
  event: string;
  data: string;
}

/**
 * An incremental Server-Sent Events parser: feed it decoded text as it arrives, get whole events back.
 *
 * <p>An event ends at a blank line, and every `data:` line inside it is part of one payload - joined with
 * `"\n"`, as the SSE spec says. That join is the whole reason this exists: Spring writes a chunk containing
 * line breaks as several `data:` lines, and the code-notes client used to emit each line as its own chunk,
 * which silently deleted every newline the model wrote ("returns:1. A layout...2. A header...").
 *
 * <p>Deliberately *not* spec-exact in one way: the single space after `data:` is kept. Spring writes values
 * with no padding, so a leading space is the payload's own - stripping it runs words together.
 */
export function createSseParser(onEvent: (event: SseEvent) => void) {
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  const dispatch = () => {
    if (dataLines.length > 0) onEvent({ event: eventName, data: dataLines.join("\n") });
    dataLines = [];
    eventName = "message";
  };

  const processLine = (rawLine: string) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line === "") {
      dispatch();
      return;
    }
    if (line.startsWith(":")) return; // a comment / keep-alive

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1);
    if (field === "event") eventName = value.trim();
    else if (field === "data") dataLines.push(value);
  };

  return {
    /** Adds newly arrived text; complete events are delivered, a partial trailing line waits for more. */
    push(text: string) {
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(processLine);
    },
    /** The stream closed: whatever is left is the last event, even without its terminating blank line. */
    end() {
      if (buffer !== "") processLine(buffer);
      buffer = "";
      dispatch();
    },
  };
}
