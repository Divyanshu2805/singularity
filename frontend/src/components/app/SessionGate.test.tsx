/**
 * Covers the door in front of the signed-in pages: nobody remembered goes to sign in without the page ever drawing,
 * a remembered session the server has ended goes to sign in as expired, and a live one opens the page.
 *
 * "Never drew" is what the test is for - the bug was a dashboard shown for a moment before its own redirect - so every
 * case renders the page with a marker and checks the marker was not mounted even once.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const auth = vi.hoisted(() => ({
  authenticated: false,
  confirmed: false,
  redirect: "/login",
  confirm: vi.fn(async () => true),
}));

vi.mock("@/lib/api", () => ({
  isAuthenticated: () => auth.authenticated,
  isSessionConfirmed: () => auth.confirmed,
  loginRedirectPath: () => auth.redirect,
  confirmSession: auth.confirm,
}));

vi.mock("@/components/app/AppLoading", () => ({ AppLoading: () => <p>loading</p> }));

import { SessionGate } from "./SessionGate";

const pageMounts = vi.fn();

function Dashboard() {
  pageMounts();
  return <p>dashboard</p>;
}

function SignIn() {
  const location = useLocation();
  return <p>sign in at {location.pathname + location.search}</p>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<SessionGate />}>
          <Route path="/projects" element={<Dashboard />} />
        </Route>
        <Route path="/login" element={<SignIn />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  Object.assign(auth, { authenticated: false, confirmed: false, redirect: "/login" });
  auth.confirm.mockReset();
  pageMounts.mockReset();
});

describe("SessionGate", () => {
  it("sends someone the browser does not remember to sign in, without drawing the page or asking the server", async () => {
    renderAt("/projects");

    expect(await screen.findByText("sign in at /login")).toBeTruthy();
    expect(pageMounts).not.toHaveBeenCalled();
    expect(auth.confirm).not.toHaveBeenCalled();
  });

  it("keeps the expired notice for a remembered session that ran out on its own clock", async () => {
    auth.redirect = "/login?expired=1";
    renderAt("/projects");

    expect(await screen.findByText("sign in at /login?expired=1")).toBeTruthy();
    expect(pageMounts).not.toHaveBeenCalled();
  });

  it("holds the loader while the server is asked, then sends an ended session to sign in", async () => {
    auth.authenticated = true;
    auth.confirm.mockResolvedValue(false);
    renderAt("/projects");

    expect(screen.getByText("loading")).toBeTruthy();
    expect(await screen.findByText("sign in at /login?expired=1")).toBeTruthy();
    expect(pageMounts).not.toHaveBeenCalled();
  });

  it("opens the page once the server confirms the session", async () => {
    auth.authenticated = true;
    auth.confirm.mockResolvedValue(true);
    renderAt("/projects");

    expect(await screen.findByText("dashboard")).toBeTruthy();
  });

  it("opens the page at once when this page load already confirmed the session", () => {
    auth.authenticated = true;
    auth.confirmed = true;
    renderAt("/projects");

    expect(screen.getByText("dashboard")).toBeTruthy();
    expect(auth.confirm).not.toHaveBeenCalled();
  });
});
