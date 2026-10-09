/**
 * The text of the Privacy and Terms pages.
 *
 * Handles: both documents as plain data - a title, the date they were last changed, one sentence saying what the
 * page is, and short sections - plus where the source and the maker are, for the pages and the footer to link to.
 *
 * Every sentence here describes what the app does today and must change when the app does: sign-in is by email and
 * password through Firebase, the session is a cookie, a build sends the request and the project's files to the AI
 * provider, a sign-in is recorded with its address and browser in the account's security trail, payments run in
 * Stripe's test mode, and there is no advertising or analytics script. Deleting an account from inside the app is
 * not built, so the page says how to ask for it and does not claim a button that is not there.
 */

export const SOURCE_URL = "https://github.com/Divyanshu2805/singularity";
export const MAKER_URL = "https://github.com/Divyanshu2805";
export const CONTACT_URL = `${SOURCE_URL}/issues`;

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  updated: string;
  summary: string;
  sections: LegalSection[];
}

export const PRIVACY: LegalDocument = {
  title: "Privacy",
  updated: "8 October 2026",
  summary: "Singularity is a personal project that shows what an AI-assisted project builder can be. This page says, plainly, what it keeps about you and where that goes.",
  sections: [
    {
      heading: "What is kept",
      paragraphs: [
        "Your account: the email address and name you sign up with. Sign-in is handled by Google's Firebase Authentication, which holds your password; Singularity never sees or stores it.",
        "Your work: the projects you create, their files and every saved version of them, your chat with the AI in each project, the explanations and lessons you open, and who you have shared a project with.",
        "Your usage: how much of the daily AI allowance each request used, so the limit of your plan can be applied and shown to you.",
        "A security trail: each sign-in and sign-out is recorded with its time, internet address and browser, so you can see where your account has been used. You can read it under Settings, Security.",
      ],
    },
    {
      heading: "Where it goes",
      paragraphs: [
        "To the AI provider. When you ask for a build, an explanation or a lesson, your request, the earlier conversation in that project and the project's files are sent to the AI model's provider (Google's Gemini API) so it can answer. Do not put passwords, keys or anything private into a project or a chat.",
        "To Stripe, if you start a checkout. Payments run in Stripe's test mode: no real card is charged and Singularity never sees card details.",
        "To the people you invite. Anyone you share a project with can see its files, and can change them if you make them an editor. Each person's chat with the AI is their own and is not shown to the others.",
        "Nowhere else. There is no advertising, no analytics script and no sale of data.",
      ],
    },
    {
      heading: "Cookies",
      paragraphs: [
        "Two cookies are set, both needed for the app to work: one keeps you signed in, and one protects your account from forged requests. Nothing is used to follow you across other sites.",
        "The app also keeps a few preferences in your browser, such as which files you had open and whether you have seen the first-run guide.",
      ],
    },
    {
      heading: "Your code while it runs",
      paragraphs: [
        "A live preview runs your project in a container of its own, apart from the app's servers and from other people's previews, and is stopped when it has been idle for a while.",
      ],
    },
    {
      heading: "Removing your data",
      paragraphs: [
        "You can delete a project at any time, and clear your chat in a project from its header. Deleting a whole account from inside the app is not built yet; to have your account and everything in it removed, open an issue on the project's source page or write to its maker, and it will be done by hand.",
        "This is a showcase run by one person on a small server. It has backups, but please keep your own copy of anything you care about - every project can be downloaded as a ZIP.",
      ],
    },
  ],
};

export const TERMS: LegalDocument = {
  title: "Terms",
  updated: "8 October 2026",
  summary: "The short version: Singularity is a showcase, offered as it is, free to try. What you build is yours. Be decent with it.",
  sections: [
    {
      heading: "What this is",
      paragraphs: [
        "Singularity is a personal project, not a company's product. It is offered as it is, with no promise that it will always be available, that a build will be right, or that your work will never be lost. Download anything you want to keep.",
      ],
    },
    {
      heading: "What you build is yours",
      paragraphs: [
        "The projects you make, and the code the AI writes for you in them, are yours to use however you like. Singularity claims no rights over them.",
        "AI-written code can be wrong, insecure or similar to code that exists elsewhere. Read it, test it, and take responsibility for what you do with it - the explanations and lessons are there to help you do exactly that.",
      ],
    },
    {
      heading: "What you may not do",
      paragraphs: [
        "Do not use Singularity to build or host anything unlawful, deceptive or harmful - phishing pages, malware, harassment, or content that abuses others.",
        "Do not try to break out of a preview, reach other people's projects, overload the service, or get around the limits of your plan.",
        "Do not put other people's private information, or secrets such as passwords and API keys, into a project or a chat.",
        "An account used this way may be suspended and its projects removed.",
      ],
    },
    {
      heading: "Plans and payments",
      paragraphs: [
        "Each plan sets a daily AI allowance, a number of projects and a number of live previews. Paid plans exist to show how billing works: checkout runs in Stripe's test mode and no real money is taken.",
      ],
    },
    {
      heading: "Changes",
      paragraphs: [
        "These terms and the Privacy page may change as the project does. The date at the top says when they last did.",
      ],
    },
  ],
};
