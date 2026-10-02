/**
 * Covers how a button answers the pointer: its position is kept in pixels, the pull only follows a mouse and settles
 * back to nothing, and a press drops one ripple where it landed, big enough to reach the far corner, that removes
 * itself when its animation ends - and none for a secondary mouse button.
 */
import { afterEach, describe, expect, it } from "vitest";
import { letGo, pressRipple, pullToPointer, trackPointer } from "./press";

function button() {
  const node = document.createElement("button");
  node.getBoundingClientRect = () => ({ left: 100, top: 50, width: 200, height: 40, right: 300, bottom: 90, x: 100, y: 50, toJSON: () => ({}) });
  document.body.appendChild(node);
  return node;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("trackPointer", () => {
  it("keeps the pointer's position on the button in pixels", () => {
    const node = button();
    trackPointer({ currentTarget: node, clientX: 150, clientY: 60 });
    expect(node.style.getPropertyValue("--x")).toBe("50.0px");
    expect(node.style.getPropertyValue("--y")).toBe("10.0px");
  });
});

describe("pullToPointer", () => {
  it("draws the button towards a mouse, further the nearer the edge", () => {
    const node = button();
    pullToPointer({ currentTarget: node, clientX: 300, clientY: 90, pointerType: "mouse" });
    expect(node.style.getPropertyValue("--tx")).toBe("4.00px");
    expect(node.style.getPropertyValue("--ty")).toBe("3.00px");
  });

  it("leaves a touch where it is", () => {
    const node = button();
    pullToPointer({ currentTarget: node, clientX: 300, clientY: 90, pointerType: "touch" });
    expect(node.style.getPropertyValue("--tx")).toBe("");
  });

  it("settles back once the pointer leaves", () => {
    const node = button();
    pullToPointer({ currentTarget: node, clientX: 300, clientY: 90, pointerType: "mouse" });
    letGo({ currentTarget: node, clientX: 320, clientY: 90 });
    expect(node.style.getPropertyValue("--tx")).toBe("0px");
    expect(node.style.getPropertyValue("--ty")).toBe("0px");
  });
});

describe("pressRipple", () => {
  it("drops one ripple where the press landed, sized to reach the far corner", () => {
    const node = button();
    pressRipple({ currentTarget: node, clientX: 110, clientY: 70, button: 0 });
    const ripple = node.querySelector<HTMLElement>(".press-ripple");
    expect(ripple).not.toBeNull();
    expect(ripple!.style.left).toBe("10px");
    expect(ripple!.style.top).toBe("20px");
    expect(ripple!.style.width).toBe(`${2 * Math.hypot(190, 20)}px`);
    expect(ripple!.getAttribute("aria-hidden")).toBe("true");
  });

  it("removes itself once it has faded", () => {
    const node = button();
    pressRipple({ currentTarget: node, clientX: 110, clientY: 70, button: 0 });
    node.querySelector(".press-ripple")!.dispatchEvent(new Event("animationend"));
    expect(node.querySelector(".press-ripple")).toBeNull();
  });

  it("ignores a secondary mouse button", () => {
    const node = button();
    pressRipple({ currentTarget: node, clientX: 110, clientY: 70, button: 2 });
    expect(node.querySelector(".press-ripple")).toBeNull();
  });
});
