/**
 * Tests for lib/editor-preferences: what stored preferences are read as, that a change is kept and announced, and
 * the pixel size each choice stands for.
 */
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EDITOR_PREFERENCES,
  editorTextPx,
  getEditorPreferences,
  parseEditorPreferences,
  setEditorPreferences,
} from "./editor-preferences";

describe("parseEditorPreferences", () => {
  it("falls back to the defaults for nothing, for rubbish and for the wrong shape", () => {
    expect(parseEditorPreferences(null)).toEqual(DEFAULT_EDITOR_PREFERENCES);
    expect(parseEditorPreferences("{not json")).toEqual(DEFAULT_EDITOR_PREFERENCES);
    expect(parseEditorPreferences("null")).toEqual(DEFAULT_EDITOR_PREFERENCES);
    expect(parseEditorPreferences('"LARGE"')).toEqual(DEFAULT_EDITOR_PREFERENCES);
  });

  it("keeps what is valid and defaults what is not, field by field", () => {
    expect(parseEditorPreferences('{"textSize":"LARGE","wrapLines":false}')).toEqual({ textSize: "LARGE", wrapLines: false });
    expect(parseEditorPreferences('{"textSize":"HUGE","wrapLines":false}')).toEqual({ textSize: "MEDIUM", wrapLines: false });
    expect(parseEditorPreferences('{"textSize":"SMALL","wrapLines":"no"}')).toEqual({ textSize: "SMALL", wrapLines: true });
  });
});

describe("setEditorPreferences", () => {
  it("changes one choice, keeps the other, and stores both", () => {
    localStorage.clear();
    setEditorPreferences({ textSize: "LARGE" });
    setEditorPreferences({ wrapLines: false });

    expect(getEditorPreferences()).toEqual({ textSize: "LARGE", wrapLines: false });
    expect(parseEditorPreferences(localStorage.getItem("editor_preferences"))).toEqual({ textSize: "LARGE", wrapLines: false });
    setEditorPreferences(DEFAULT_EDITOR_PREFERENCES);
  });

  it("still changes the choice in memory when storage refuses", () => {
    const refuse = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    setEditorPreferences({ textSize: "SMALL" });
    expect(getEditorPreferences().textSize).toBe("SMALL");
    refuse.mockRestore();
    setEditorPreferences(DEFAULT_EDITOR_PREFERENCES);
  });
});

describe("editorTextPx", () => {
  it("gives each size its pixels, with medium the size the editor always had", () => {
    expect(editorTextPx("SMALL")).toBe(12.5);
    expect(editorTextPx("MEDIUM")).toBe(13.5);
    expect(editorTextPx("LARGE")).toBe(15);
  });
});
