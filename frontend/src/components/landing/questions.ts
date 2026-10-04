/**
 * The home page's questions and answers, as the list the questions section (Faq) shows.
 *
 * Handles: the ten questions in the order a doubtful visitor asks them - what it builds, whether they need to code,
 * what it cannot build yet, where the code runs, whether it is theirs to take, working with others, signing in, the
 * daily allowance, cancelling - and, only in a build whose payments are in test mode (lib/payments-mode), whether
 * payments are real, so a build taking real money never says they are not.
 *
 * Every answer describes what the app does today. Three differ from the first landing page's list on purpose: the
 * interview is "a few questions" rather than four (it asks two to four), the stack is named in full (React,
 * TypeScript, Vite and Tailwind), and "what can't it build yet?" is new - generated apps run entirely in the browser,
 * with no server or database of their own and one stack, and the page should say so before a visitor finds out.
 * The sandbox's ten idle minutes are workspace-service's preview idle-timeout.
 */
import { Boxes, Container, CreditCard, Database, FlaskConical, Gauge, GraduationCap, PackageOpen, ShieldCheck, Users } from "lucide-react";
import { PAYMENTS_TEST_MODE, TEST_CARD_NUMBER } from "@/lib/payments-mode";
import type { Question } from "./Faq";

const ALWAYS: Question[] = [
  {
    icon: Boxes,
    q: "What does Singularity actually build?",
    a: "Web apps that run in the browser. Describe an idea, answer a few questions, and it writes a React, TypeScript, Vite and Tailwind project file by file. Keep asking for changes until it's what you wanted.",
  },
  {
    icon: GraduationCap,
    q: "Do I need to know how to code?",
    a: "No. Everything happens through the chat and the live preview. If you want to learn along the way, choose Teach me for plain-English notes on the code, or ask ExplainLLM why any line works.",
  },
  {
    icon: Database,
    q: "What can't it build yet?",
    a: "Apps that need their own server or database. Projects are front-end apps, so anything they save stays in the browser. There is one stack for now: React with Vite.",
  },
  {
    icon: Container,
    q: "Where does my code run?",
    a: "Only inside a sandbox of its own, never on the servers that run Singularity. The AI writes files and nothing else, and the sandbox shuts down after ten minutes idle.",
  },
  {
    icon: PackageOpen,
    q: "Can I take my code with me?",
    a: "Yes. Download the whole project as a ZIP and run it anywhere. It's a normal project with its own package.json, so there's no lock-in.",
  },
  {
    icon: Users,
    q: "Can I build with other people?",
    a: "Invite people by email as an editor or a viewer. Editors can change the project and use the chat, viewers can open it and watch the preview, and only the owner can invite or manage members.",
  },
  {
    icon: ShieldCheck,
    q: "How do I sign in, and is my account safe?",
    a: "Sign in with Google or with email and a password. You can add an authenticator app for two-factor, see recent security events, and sign out of every device at once.",
  },
  {
    icon: Gauge,
    q: "What happens when I run out of tokens?",
    a: "Each plan has a daily AI allowance and a project limit, enforced by the server. The allowance refills at midnight, and the usage page shows exactly where it went.",
  },
  {
    icon: CreditCard,
    q: "Can I cancel my plan?",
    a: "Any time, from billing settings. You keep your paid plan until the end of the period you've paid for, then move to the free plan. Projects beyond the free limit stay; you just can't create new ones.",
  },
];

const TEST_MODE: Question = {
  icon: FlaskConical,
  q: "Are payments real?",
  a: `Not on this demo. Payments run in Stripe's test mode, so no real money moves. Use the card ${TEST_CARD_NUMBER}.`,
};

export const HOME_QUESTIONS: Question[] = PAYMENTS_TEST_MODE ? [...ALWAYS, TEST_MODE] : ALWAYS;
