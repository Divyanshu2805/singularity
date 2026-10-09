/**
 * Tests for how links and images in model-written text are drawn.
 *
 * Handles: a web link opens in a new tab cut off from this one and shows its site when its words do not; a link that
 * is not a web or mail address is left as plain words; an image is never fetched and becomes its description; and
 * raw HTML in the text is not rendered.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ChatMarkdown } from "./ChatMarkdown";

describe("ChatMarkdown", () => {
  it("opens a web link in a new tab and says where it leads", () => {
    const { container } = render(<ChatMarkdown>{"[Sign in again to continue](https://evil.example/login)"}</ChatMarkdown>);

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://evil.example/login");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toContain("noopener");
    expect(link?.getAttribute("rel")).toContain("noreferrer");
    expect(container.textContent).toContain("(evil.example)");
  });

  it("does not repeat a site the link's words already name", () => {
    const { container } = render(<ChatMarkdown>{"See https://react.dev/learn for more."}</ChatMarkdown>);

    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://react.dev/learn");
    expect(container.textContent).not.toContain("(react.dev)");
  });

  it("leaves a link that is not a web or mail address as plain words", () => {
    const { container } = render(<ChatMarkdown>{"[open](/projects/1) and [run](javascript:alert(1))"}</ChatMarkdown>);

    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("open");
  });

  it("never fetches an image", () => {
    const { container } = render(<ChatMarkdown>{"![a chart](https://evil.example/pixel.png?who=you)"}</ChatMarkdown>);

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("a chart");
    expect(container.textContent).toContain("(evil.example)");
  });

  it("does not render raw HTML", () => {
    const { container } = render(<ChatMarkdown>{"<img src=x onerror=alert(1)> <script>alert(1)</script> hello"}</ChatMarkdown>);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });
});
