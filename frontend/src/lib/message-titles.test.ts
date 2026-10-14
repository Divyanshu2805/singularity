import { beforeEach, describe, expect, it } from "vitest";
import { markMessagesTitled, messagesToTitle, resetMessageTitleRequests } from "./message-titles";

const sent = (serverId?: number, title?: string) => ({ role: "user" as const, serverId, title });
const reply = (serverId: number) => ({ role: "assistant" as const, serverId });

describe("message titles", () => {
  beforeEach(() => resetMessageTitleRequests());

  it("asks for the saved, untitled messages once the rail is shown and nothing is streaming", () => {
    const messages = [sent(1), reply(2), sent(3, "Rename the app"), reply(4), sent(5), reply(6)];

    expect(messagesToTitle("7", messages, false)).toEqual([1, 5]);
    expect(messagesToTitle("7", messages, true)).toEqual([]);
    expect(messagesToTitle("", messages, false)).toEqual([]);
  });

  it("waits until there is more than one message, and skips one not saved yet", () => {
    expect(messagesToTitle("7", [sent(1), reply(2)], false)).toEqual([]);
    expect(messagesToTitle("7", [sent(1), reply(2), sent(undefined)], false)).toEqual([1]);
  });

  it("asks about each message once per project until sign-out", () => {
    const messages = [sent(1), reply(2), sent(3)];
    markMessagesTitled("7", [1, 3]);

    expect(messagesToTitle("7", messages, false)).toEqual([]);
    expect(messagesToTitle("8", messages, false)).toEqual([1, 3]);
    resetMessageTitleRequests();
    expect(messagesToTitle("7", messages, false)).toEqual([1, 3]);
  });
});
