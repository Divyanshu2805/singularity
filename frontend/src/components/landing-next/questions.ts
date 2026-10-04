/**
 * The new landing page's questions and answers.
 *
 * Handles: the eight questions a visitor asks before signing up, each with the icon its row carries and an answer
 * that states only what the app does today - the stack the starter template uses, where generated code runs, the
 * ZIP download, the three project roles, the two sign-in methods with two-factor, the daily allowance, and cancelling
 * at the end of the billing period. The same answers the old landing page gave, so the two never disagree while both
 * exist. It is a module of its own so the component that reads it stays hot-reloadable.
 */
import { Boxes, Container, CreditCard, Gauge, GraduationCap, PackageOpen, ShieldCheck, Users, type LucideIcon } from "lucide-react";

export interface Question {
  icon: LucideIcon;
  q: string;
  a: string;
}

export const QUESTIONS: Question[] = [
  {
    icon: Boxes,
    q: "What does Singularity actually build?",
    a: "Real web apps. You describe an idea, answer four quick questions, and the AI writes a React, Vite and Tailwind project for you file by file in a chat. Then keep asking for changes until it's what you wanted.",
  },
  {
    icon: GraduationCap,
    q: "Do I need to know how to code?",
    a: "No. Everything happens through the chat and the live preview. If you want to learn along the way, switch on teaching mode for plain-English notes on the code, or ask ExplainLLM why any line works.",
  },
  {
    icon: Container,
    q: "Where does my code run?",
    a: "Only inside an isolated preview pod of its own on Kubernetes, never on our servers. The AI writes files and nothing else, and the pod is shut down once it sits idle.",
  },
  {
    icon: PackageOpen,
    q: "Can I take my code with me?",
    a: "Yes. Download the whole project as a ZIP whenever you like and run it anywhere. It's a normal project with its own package.json, so there's no lock-in.",
  },
  {
    icon: Users,
    q: "Can I build with other people?",
    a: "Invite people by email as an editor or a viewer. Editors can change the project and use the chat, viewers can open it and watch the preview, and only you as the owner can invite or manage members.",
  },
  {
    icon: ShieldCheck,
    q: "How do I sign in, and is my account safe?",
    a: "Sign in with Google or with email and a password. You can add an authenticator app for two-factor, see recent security events, and sign out of every device at once.",
  },
  {
    icon: Gauge,
    q: "What happens when I run out of tokens?",
    a: "Each plan has a daily AI allowance and a project limit, enforced by the server. The allowance refills every day, and the usage page shows exactly where it went. Need more? Move up a plan.",
  },
  {
    icon: CreditCard,
    q: "Can I cancel my plan?",
    a: "Any time, from billing settings. You keep your paid plan until the end of the period you've paid for, then move to the free plan. Projects beyond the free limit stay — you just can't create new ones.",
  },
];
