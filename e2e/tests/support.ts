/**
 * What the browser journey needs that is not a step of the journey itself.
 *
 * Handles: making a person the app can sign in - an account in the Firebase Auth emulator with a verified email,
 * since the app refuses an unverified one - and a clock for timing a step.
 *
 * The account is made through the emulator's own REST API, the same calls Firebase's SDK and console make against
 * the real service. Its email is new on every run, so a run never meets what an earlier one left behind.
 */
import { stack } from "../playwright.config";

export type Person = { email: string; password: string; name: string };

export async function aNewPerson(): Promise<Person> {
  const { authEmulator, firebaseProject } = stack();
  const person: Person = {
    email: `journey-${Date.now()}@example.com`,
    password: "Journey-pass-2026!",
    name: "Journey Tester",
  };

  const signUp = await fetch(`${authEmulator}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=journey-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: person.email, password: person.password, displayName: person.name, returnSecureToken: true }),
  });
  if (!signUp.ok) throw new Error(`The Auth emulator refused to create an account: ${await signUp.text()}`);
  const { localId } = (await signUp.json()) as { localId: string };

  const verify = await fetch(`${authEmulator}/identitytoolkit.googleapis.com/v1/projects/${firebaseProject}/accounts:update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ localId, emailVerified: true }),
  });
  if (!verify.ok) throw new Error(`The Auth emulator refused to verify the account's email: ${await verify.text()}`);

  return person;
}

export function stopwatch(): () => number {
  const started = Date.now();
  return () => Date.now() - started;
}
