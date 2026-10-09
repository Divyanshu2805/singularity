/**
 * Proves the Firebase Auth emulator can only ever be this machine's own.
 *
 * Handles: the address a build was given being used when it is a plain-http localhost or loopback address, and being
 * ignored when it is any other host, any other scheme, or not an address at all - both where the app decides whether
 * to connect to it and where the content security policy decides whether the page may.
 *
 * The switch exists for the browser journey test. Were it to accept any address, a build variable would be enough to
 * send every sign-in to someone else's server.
 */
import { describe, expect, it } from "vitest";
import { authEmulatorUrl } from "./firebase";
import { buildContentSecurityPolicy } from "../../csp";

const connectSources = (policy: string) =>
  policy
    .split("; ")
    .find((directive) => directive.startsWith("connect-src "))!
    .split(" ")
    .slice(1);

describe("the auth emulator address", () => {
  it("is used when it is this machine", () => {
    expect(authEmulatorUrl("http://127.0.0.1:19099")).toBe("http://127.0.0.1:19099");
    expect(authEmulatorUrl("http://localhost:9099/")).toBe("http://localhost:9099");
    expect(authEmulatorUrl("http://[::1]:9099")).toBe("http://[::1]:9099");
  });

  it("is ignored when it is anywhere else", () => {
    expect(authEmulatorUrl(undefined)).toBeNull();
    expect(authEmulatorUrl("")).toBeNull();
    expect(authEmulatorUrl("not an address")).toBeNull();
    expect(authEmulatorUrl("https://auth.example.com")).toBeNull();
    expect(authEmulatorUrl("http://auth.example.com:9099")).toBeNull();
    expect(authEmulatorUrl("http://localhost.example.com:9099")).toBeNull();
    expect(authEmulatorUrl("http://127.0.0.1.example.com:9099")).toBeNull();
    expect(authEmulatorUrl("https://localhost:9099")).toBeNull();
  });
});

describe("the content security policy", () => {
  it("lets the page reach a local emulator it was built for", () => {
    const policy = buildContentSecurityPolicy({ VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:19099" });
    expect(connectSources(policy)).toContain("http://127.0.0.1:19099");
  });

  it("names no emulator when the build was given none", () => {
    expect(connectSources(buildContentSecurityPolicy({}))).toEqual([
      "'self'",
      "https://*.googleapis.com",
      "https://www.google.com/recaptcha/",
    ]);
  });

  it("does not open the page to an address that is not this machine", () => {
    const policy = buildContentSecurityPolicy({ VITE_FIREBASE_AUTH_EMULATOR_URL: "http://auth.example.com:9099" });
    expect(policy).not.toContain("example.com");
  });
});
