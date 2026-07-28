/**
 * An incremental Server-Sent Events parser: feed it decoded text as it arrives, get whole events back.
 *
 * Handles: buffering partial lines, joining an event's several data lines into one payload, and dispatching at the
 * blank line that ends an event.
 *
 * The join is the whole reason this exists: the server writes a chunk containing line breaks as several data lines,
 * and reading each line as its own chunk silently deleted every newline the model wrote. It is deliberately not
 * spec-exact in one way - the single space after the field name is kept, because the server writes values with no
 * padding and stripping it runs words together.
 */
export interface SseEvent {
  event: string;
  data: string;
}

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
    if (line.startsWith(":")) return;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1);
    if (field === "event") eventName = value.trim();
    else if (field === "data") dataLines.push(value);
  };

  return {
    push(text: string) {
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(processLine);
    },
    end() {
      if (buffer !== "") processLine(buffer);
      buffer = "";
      dispatch();
    },
  };
}
