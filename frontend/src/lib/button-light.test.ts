/**
 * Tests for placing a button's light under the pointer.
 *
 * Handles: writing the pointer's position onto the button it is over, finding the button from an element inside it
 * (the label, an icon), and leaving everything that is not a button alone.
 */
import { afterEach, describe, expect, it } from "vitest";
import { buttonLightAt } from "./button-light";

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(html: string) {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

describe("buttonLightAt", () => {
  it("writes the pointer's position onto the button", () => {
    const button = mount('<button class="btn btn-primary">Start preview</button>');
    button.getBoundingClientRect = () => ({ left: 100, top: 40, width: 140, height: 36 }) as DOMRect;
    buttonLightAt(button, 130, 58);
    expect(button.style.getPropertyValue("--bx")).toBe("30px");
    expect(button.style.getPropertyValue("--by")).toBe("18px");
  });

  it("finds the button from an element inside it", () => {
    const button = mount('<button class="app-chip"><span>Build</span></button>');
    button.getBoundingClientRect = () => ({ left: 10, top: 10, width: 90, height: 36 }) as DOMRect;
    buttonLightAt(button.querySelector("span"), 60, 20);
    expect(button.style.getPropertyValue("--bx")).toBe("50px");
    expect(button.style.getPropertyValue("--by")).toBe("10px");
  });

  it("leaves anything that is not one of the app's buttons alone", () => {
    const plain = mount("<div><p>Just text</p></div>");
    buttonLightAt(plain.querySelector("p"), 5, 5);
    expect(plain.style.getPropertyValue("--bx")).toBe("");
    buttonLightAt(null, 5, 5);
  });
});
