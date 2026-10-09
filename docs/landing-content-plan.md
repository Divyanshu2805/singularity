# Landing page content plan

What the new landing page says, section by section, before any animation or UI is designed.

Every line of copy below was checked against the code as it is on 2026-10-03. Where the first page says something the app does not quite do, the correction is called out.

## Status (2026-10-03)

The owner accepted every recommendation in section 5. The content is laid out and live:

| Where | What |
|---|---|
| `/` | The new page, `frontend/src/pages/Home.tsx`: all the content below on the star sky alone, with the navigation as it was. No nebula, fabric floor or black hole. It is being themed afterwards, one section at a time (below). |

Motion on the new page: the demos play as before, the plans keep their entrance exactly, and every other card rises into place with the scroll the same way (`components/landing/scroll-rise.ts`).

Theming has started, one section at a time. The hero is first: the app's breathing sky behind it, a space-time grid under the copy that dips round the prompt, and a ripple that leaves the prompt and reaches the project window as each build starts (`HeroSky.tsx`, `HeroFabric.tsx`). An entrance in which the grid zooms in on one of its own squares and carries the project window up to full size was built and is switched off (`SHEET_ENTRANCE` in `Home.tsx`) - the owner did not like how it came in, so the window opens with its own unroll as before. With the switch on, the grid zooms in on one of its own squares - its lines stream out from that square, finer grids coming into view on the way - and the real project window, standing in the square, is carried up to its full size by the same magnification; the headline and the prompt do not move, so it reads as the view closing in while the page stays put. It takes about a second and runs alongside the copy arriving (`lib/expansion.ts`, `components/landing/expansion.ts`). The grid also curves under the sun and the moon of the logo's eclipse as they move.

How it works is the second (2026-10-04), at the owner's request: the first page's orbit is back, with the five steps of this plan. On a wide screen the steps stand round a dark planet with the project window at its centre. As the visitor scrolls, a comet comes down out of the sky, passes behind the heading and strikes the top of the planet; its light then runs clockwise round the rim while the page is held still, each step's film playing as the light crosses that step's fifth of the ring, and when the ring has closed the view draws back to the whole planet and the page moves on. The orbit sizes itself to the screen: it is shown at the largest zoom at which, for every step, the whole window and that step's card fit the screen together, the same zoom for all five steps; the view travels round the window with the light as the visitor scrolls, as far as keeping the window and the step's card on screen allows, and the other cards may run off the edges. The comet lands as the orbit pins, with the planet held low enough that the window is whole on screen from the first step. Everything is a function of the scroll position, so scrolling back rewinds it (`StepOrbit.tsx`, `comet.ts`). The comet, the bloom where it lands and the light on the rim are painted from one gold ramp (`glsl.ts`), so they are the same colour at every brightness; the first page's ramp, which runs through orange, made the rim look a different light from the comet that lit it. A narrow screen, and anyone who has asked for reduced motion, gets the steps as the list beside the window that the section was before (`StepList.tsx`); both read one list of steps (`how-steps.ts`). The first page's planet rim and beam above the heading (`HorizonArc.tsx`) are not used: the comet is what lights the orbit now.

Features was to be the third (2026-10-04). A version was built as a development-only draft and then removed from the repository on the owner's decision, so `/` keeps the flat section; the draft is in the Git history (commit `2b288d2`) if it is wanted again. What it did: From six ideas the owner took three, on one condition - "when I scroll the animation of cards should behave as I scroll". The hero's grid carries on behind the section and every card is a weight on it: as a card rises into place the grid sinks under it, and once it has landed one ring leaves its edge and crosses the grid; how deep the well is and how far the ring has gone are read off the scroll position alone, so both follow the wheel down the page and back up it. In the chapter being read only one card's film plays at a time while the others stand on their finished frame with their screens dimmed; the turn passes along the row when the film ends, and moving the pointer onto a card takes the turn and holds it. The chapter across the middle of the screen is fully lit and the ones above and below dim as they move away. The cards, the copy and the rows were unchanged. Under 1024px, and under reduced motion, the section is as it was.

The remaining sections still stand on the bare star sky.

A rebuild of the page is under way (2026-10-05), at the owner's request, at `/genesis` - a route that exists in development only, so `/` is untouched until the owner approves the swap (`frontend/src/pages/Genesis.tsx`). The copy and the sections of this plan are unchanged. The order of work is the owner's: the background first, then all the content laid out on it, and only then animation, transitions and motion. The background is the app's own sky, which the owner chose from three (the app's sky, real space photographs, plain deep space): the landing's star field with the dashboard's wash of rose, amber and gold at the foot of the window, nearly as strong as the dashboard's behind the hero and at the strength of the app's panel pages below it (`frontend/src/components/genesis/Sky.tsx`). On it stand all the sections, as content: the hero (the mark, the headline set larger and lighter, the line, the prompt, and since the same day the project window beside them), how it works as the flat list, what you can build, Understand, the features, the plans, the questions, the closing call and the footer. They are the home page's own components; the closing call and the footer were moved out of `Home.tsx` into files of their own so both pages show the same ones. Nothing is pinned and no section has a device of its own. Motion has started with the hero only (2026-10-05), after a reference page's hero the owner recorded and asked to have matched. What stands now, after the owner cut a first, closer pass back the same day:

- **The opening** (`components/genesis/Opening.tsx`, timetable and cover arithmetic in `lib/opening.ts`): the page arrives under a cover in the brand's gold with the logo's tile at its centre; the cover, a square with rounded corners, closes onto the tile over 850ms, is a thin ring round it for a moment and is gone, and the tile fades after it. It is held until the web fonts are in. It does not play under reduced motion, on a load that is already scrolled, or on a return from the sign-in pages by the page slide.
- **The layout**: from 1280px up the hero is one screen of two columns - the logo, the headline on three lines, the line, the prompt and the note on the left; the project window on the right, whole on the screen, standing in a slight perspective. The project window is no longer a section of its own under the hero. Below 1280px the copy is centred on the first screen with the window flat under it.
- **The entrance** behind the cover: the headline, the line, the prompt and the note come up one after another and the window comes up once, as a whole; when they have landed the logo's eclipse (the home page's `EclipseMark`), the window's film and the falling stars begin. Opacity and transform only.
- **Falling stars** behind the hero (`components/genesis/Meteors.tsx`): the app's own shooting star given a longer, steeper fall, eight of them on cycles of their own, CSS only.

Taken out at the owner's request on the way: a ribbon of gold threads behind the window (a 2D canvas; `Ribbon.tsx` and `lib/ribbon.ts`, never committed), a badge over the headline and a note that typed themselves, the headline coming out of a blur, the window's panels arriving one by one, the window following the pointer, and the window running off the right edge of the screen as the reference's does.

A first approach to the rebuild was turned down the same day. It was one continuous WebGL scene behind the page: a sky with a worked-out Milky Way, a black hole above the headline that brightened as the visitor typed, and a burst of light played by the first screen of scroll. The owner saw the hero and the burst and disliked three things: the sky read as a brownish haze, and neither the black hole nor the flash was wanted. That scene's code was deleted at the owner's request; it was never committed, so it is not in the Git history.

Still open from this plan:

| Item | Why it is not on the page |
|---|---|
| Captures on the six example cards | No generated apps have been captured yet; the cards are words only |
| Footer links to the source, Privacy and Terms | Those pages do not exist, and which repository to link is the owner's call |
| A plain "about N builds a day" line on each plan | Blocked on the daily allowances (decision 8) |

The navigation names every section (2026-10-04): How it works · Examples · Understand · Features · Pricing · FAQ. "Examples" is the short label for "What you can build", which is too long for the pill. To fit six links the scrolled pill narrows to 70rem instead of 56rem, the links show from 1024px up, and "Sign in" from 1280px up (`LandingNav.tsx`).

---

## 1. What the page has to do

**One job:** get a visitor to type an idea and sign up.

**Who arrives:**

| Visitor | What they want to know |
|---|---|
| Someone with an idea and little or no code | Will it build what I mean, and will it really work? |
| Someone learning to code | Will I understand what it wrote? |
| A developer wanting a fast first version | Is the code real, standard, and mine? |
| Someone judging the product itself | Is this a real system or a mockup? |

**The promise, in one sentence:** Singularity turns a sentence into a working web app, running live, that you can read, change and take with you.

**The three things the page leads with** (the rest is support):

1. **It asks before it builds.** Two to four questions written for that idea, then a brief.
2. **It runs for real.** Every project gets its own sandbox and a live preview.
3. **It explains itself.** Teach me mode and ExplainLLM. No other builder in this category leads with this.

---

## 2. Section map

| # | Section | The visitor's question | Against the present page |
|---|---|---|---|
| 0 | Navigation | Where am I, how do I start? | Add a "Sign in" link |
| 1 | Hero | What is this? What do I do? | Add one supporting line and a working prompt |
| 2 | How it works | What happens after I type? | 7 steps become 5 |
| 3 | What you can build | Is my idea the kind of thing it makes? | **New** |
| 4 | Understand | Why this one and not another builder? | Promoted from a feature chapter to its own section |
| 5 | Features | What else do I get? | 13 tiles in 5 chapters become 10 tiles in 4 |
| 6 | Pricing | What does it cost? | Same cards, live from the server |
| 7 | FAQ | What's the catch? | 8 questions become 10, two of them new and honest |
| 8 | Closing call | Fine, let me try it | **New** (replaces the sign-up card beside the FAQ) |
| 9 | Footer | Who made this, where's the rest? | Add source, privacy and terms links |

Every section is an eyebrow plus a two-part heading and nothing under it. No summary sentence below any heading; the cards and demos carry the information.

---

## 3. Section by section

### 0. Navigation

- Mark and name (left)
- How it works · Examples (What you can build) · Understand · Features · Pricing · FAQ
- **Sign in** (text link, to `/login`)
- **Start building** (button, to `/signup`)

The present page has only "Start building", which goes to `/login`. A returning user and a new one should each have their own way in.

### 1. Hero

| Piece | Content |
|---|---|
| Headline | **Where an idea instantly expands into an app.** (kept, the owner's wording) |
| Supporting line | Describe what you want. Singularity asks a few questions, writes the project file by file, and runs it live while you watch. |
| Action | The app's real prompt box. Placeholder types the example ideas in turn. Build / Teach me menu, as in the app. |
| Under the prompt | Free to start. No card needed. |
| Product window | The real workspace (chat, code, preview) playing one build from prompt to running app, then one change. |

Sending the prompt saves the idea, goes to sign-up, and the dashboard's prompt opens with it already filled in. `lib/pending-idea.ts` already does this.

The present hero has a headline and a window, and nothing that says what the product does or lets the visitor act. The supporting line and the prompt fix both.

**Script for the product window** (one loop):
1. Idea typed: "a habit tracker with daily streaks"
2. The checklist appears and ticks as files land
3. Code panel: files stream in
4. Preview: the habit tracker running, a streak being ticked
5. Change typed: "add a weekly view"
6. Preview updates with the weekly view

### 2. How it works

**Heading:** From a sentence / *to something you can click.* (kept)

| # | Step | Title | One line | What is shown |
|---|---|---|---|---|
| 1 | Describe | Say what you want | Type the idea the way you'd say it to a friend. | Dashboard prompt |
| 2 | Answer | A few quick questions | Written for your idea, then turned into a brief. | Interview card |
| 3 | Build | Every file, streamed | A checklist ticks off as each file is written. | Chat checklist and code |
| 4 | Run | Live in its own sandbox | A real dev server boots and you click the actual app. | Preview booting, then running |
| 5 | Change | Ask for what's next | It edits the files and the running app updates. | Chat turn, preview reloading |

Cut from the present seven: the second "Preview" step (folded into Change) and ExplainLLM (it moves to section 4, where it is the point rather than a seventh step).

**Correction:** the present page says "four questions" in four places. The interview asks two, three or four depending on how much the idea already says. Use "a few questions" or "two to four".

### 3. What you can build (new)

**Heading:** Start with an idea / *like one of these.*

Six cards. Each one is a prompt, a capture of the app Singularity actually built from it, and one action: **Start with this** (carries that prompt through sign-up, like the hero prompt).

| Prompt | Kind of app |
|---|---|
| A habit tracker with daily streaks | Tracker |
| A landing page for my coffee shop | Marketing page |
| A kanban board for my side projects | Productivity |
| A personal finance dashboard with charts | Dashboard |
| A recipe book with search and favourites | Collection |
| A study planner for exam week | Planner |

The first five are already the app's own suggestions (`lib/idea-suggestions.ts`). Keep one list so the landing page and the app never disagree.

All six are things the product builds well: apps that run entirely in the browser. Nothing here should need a server or a database.

**This section needs real assets.** Each capture must come from an app the product generated, not a drawing. If those are not made, drop the section and show the six prompts as quick-start cards under the hero prompt instead.

### 4. Understand (the signature section)

**Heading:** It builds the app. / *Then it explains it.*

Alternatives: "An app you understand, / *not a black box.*" · "Learn what it wrote, / *line by line.*"

Two large panels, each a real demo:

| Label | Title | Body | Demo |
|---|---|---|---|
| Teach me | Learn while it writes. | Choose Teach me and each file arrives with a plain-English note on the idea behind it, linked to the exact line. | Teaching notes in the chat, a click jumping to the line |
| ExplainLLM | Ask about any line. | Select code and ask why. It reads your files to answer and has no way to change them. Your questions stay private to you. | Selection, question, streamed answer |

This is what separates Singularity from other builders, and on the present page it is the third of five equal chapters. It deserves the spot right after "what can I build".

### 5. Features

**Heading:** Every feature, / *already doing its job.* (kept)

Four chapters, ten tiles. Each tile is a working demo, a label, a title and one or two sentences.

**Build — From one sentence to real files.**

| Label | Title | Body |
|---|---|---|
| Idea interview | A few questions, one clear brief. | Two to four questions written for your idea, not pulled from a fixed list. Your answers become the brief the build starts from. |
| Streamed build | Watch every file get written. | A checklist of the plan ticks off as each file streams into the project. No spinner, no waiting to find out. |
| Diffs | See exactly what changed. | Every turn marks the files it touched. Turn on the diff and read each change against the version before. |

**Run — Running for real, fixed in a click.**

| Label | Title | Body |
|---|---|---|
| Live preview | It runs for real. Not in a mockup. | Each project gets its own dev server in an isolated sandbox. Click around the actual app; it updates when a change lands. |
| Fix errors | Broken? Hand it back. | When the running app throws an error, it shows beside the preview with one button that sends it to the chat as a fix request. |

**Share — Build it together.**

| Label | Title | Body |
|---|---|---|
| Collaborate | Editors and viewers. | Invite people by email. Editors change the project and use the chat, viewers open it and watch the same live preview. Only the owner manages who's in. |
| Fork | Take it somewhere new. | Fork any project you can open. The copy is yours, with every file and a fresh chat. The original is untouched. |

**Own — Yours to keep, and yours to control.**

| Label | Title | Body |
|---|---|---|
| Download | Your code, yours to keep. | Download the whole project as a ZIP. It is a normal React project with its own package.json, so it runs anywhere. |
| Usage | Know exactly where it went. | A daily allowance that refills, and a breakdown by day, project and feature, with CSV export. |
| Security | Signed in, and staying yours. | Sign in with Google or email, add an authenticator app for two-factor, and sign out everywhere in one click. |

**Cut:** "Find anything" (code search and ⌘K). It is a convenience, not a reason to sign up. "Teaching mode" and "ExplainLLM" moved to section 4.

**Correction:** the present Live preview tile says it "hot-reloads as files change". The preview reflects a turn once its files have finished writing. Say "updates when a change lands".

### 6. Pricing

**Heading:** Start free. / *Grow when it clicks.* (kept)

Three cards. Every number comes from the server, never from the page.

| | Free | Pro (Most popular) | Business |
|---|---|---|---|
| Price | ₹0 | ₹499 / month | ₹1,499 / month |
| Projects | 1 | 3 | 10 |
| AI tokens per day | 100,000 | 300,000 | 1,000,000 |
| Live previews at once | 1 | 3 | 10 |
| Also | Full editor, chat and ExplainLLM · Teaching mode | Everything in Free · Priority when the AI is busy | Everything in Free · Priority when the AI is busy |
| Button | Start for free | Choose Pro | Choose Business |

Under the cards, only in a test-mode build: "Payments are in Stripe test mode — no real money moves."

**Missing, and it matters:** "AI tokens per day" means nothing to someone who has never used one of these. Each card needs a plain translation such as "about N builds a day". That line cannot be written yet. See open decision 8.

### 7. FAQ

**Heading:** Questions, / *answered.* (kept)

One flat list, ten questions. **New** marks the two additions.

1. **What does Singularity actually build?**
   Web apps that run in the browser. Describe an idea, answer a few questions, and it writes a React, TypeScript, Vite and Tailwind project file by file. Keep asking for changes until it's what you wanted.
2. **Do I need to know how to code?**
   No. Everything happens through the chat and the live preview. If you want to learn along the way, choose Teach me for plain-English notes on the code, or ask ExplainLLM why any line works.
3. **What can't it build yet?** *(New)*
   Apps that need their own server or database. Projects are front-end apps, so anything they save stays in the browser. There is one stack for now: React with Vite.
4. **Where does my code run?**
   Only inside a sandbox of its own, never on the servers that run Singularity. The AI writes files and nothing else, and the sandbox shuts down after ten minutes idle.
5. **Can I take my code with me?**
   Yes. Download the whole project as a ZIP and run it anywhere. It's a normal project with its own package.json, so there's no lock-in.
6. **Can I build with other people?**
   Invite people by email as an editor or a viewer. Editors can change the project and use the chat, viewers can open it and watch the preview, and only the owner can invite or manage members.
7. **How do I sign in, and is my account safe?**
   Sign in with Google or with email and a password. You can add an authenticator app for two-factor, see recent security events, and sign out of every device at once.
8. **What happens when I run out of tokens?**
   Each plan has a daily AI allowance and a project limit, enforced by the server. The allowance refills at midnight, and the usage page shows exactly where it went.
9. **Can I cancel my plan?**
   Any time, from billing settings. You keep your paid plan until the end of the period you've paid for, then move to the free plan. Projects beyond the free limit stay; you just can't create new ones.
10. **Are payments real?** *(New, test-mode builds only)*
    Not on this demo. Payments run in Stripe's test mode, so no real money moves. Use the card 4242 4242 4242 4242.

### 8. Closing call (new)

**Heading:** What will you / *build first?*

The same prompt box as the hero, with the same example ideas typing through it, and nothing else. It replaces the "Still wondering?" card that sits beside the FAQ today, so the page ends on the action instead of tucking it into a side column.

### 9. Footer

- Mark and name, with one line: **Describe an idea, answer a few questions, and watch a real project get built, run and explained.**
- Product: How it works · What you can build · Features · Pricing · FAQ
- Account: Create an account · Sign in
- **New:** Source on GitHub · Privacy · Terms
- The name set very large, last thing on the page (kept)

Privacy and Terms pages do not exist yet. A site that takes sign-ins and card details needs both before it is shared widely.

---

## 4. Copy rules

**Voice:** plain and short. Say what the app does, in the words a user would use. Sentence case. No exclamation marks.

**Always:**
- "Singularity" for the product name
- "a few questions" or "two to four", never "four"
- "sandbox" in ordinary copy; "Kubernetes pod" only in the FAQ or a technical aside
- The app's own names: Build, Teach me, ExplainLLM, Owner, Editor, Viewer
- Plan numbers from the server

**May claim, since it works today (publishing, `docs/architecture/flows/publishing.md`):** the owner publishes an app at a link anyone can open with no account; the link stays the same when they update it; they can take it down; and they can share the code so others can read and fork it. Say "publish" and "a link anyone can open"; say nothing about hosting, uptime or scale, which have not been measured. Plans limit how many apps can be live (the numbers come from the server's plan settings, not from copy).

**Never claim, because the app does not do it today:**

| Claim | Why not |
|---|---|
| Version history, undo, restore | The API exists; no screen uses it |
| Backends, databases, sign-in inside generated apps | Generated apps are browser-only |
| Custom domains, a password on a published app, visitor analytics, older versions to go back to | Publishing is one link per project and one live version; these are not built |
| A published app with a server, a database or sign-in | Published apps are static and browser-only, like the previews they come from |
| Other stacks (Next.js, Vue, and so on) | One template: React with Vite |
| Live reload as you type | The preview updates when a turn finishes |
| User counts, testimonials, logos, speed figures | None exist or have been measured |

---

## 5. Open decisions

Each has a recommendation. Nothing in the UI phase should start on a section whose decision is still open.

| # | Decision | Recommendation |
|---|---|---|
| 1 | A supporting line under the hero headline | Yes. The headline alone does not say what the product does. |
| 2 | The hero's action is a working prompt, not a button | Yes. It is the product's own first step, and the hand-off already exists. |
| 3 | "What you can build" as a section with real captures | Yes, if six apps are generated and captured. Otherwise six prompt cards under the hero. |
| 4 | Understand as its own section | Yes. It is the difference from every other builder. |
| 5 | Five steps in How it works instead of seven | Yes. |
| 6 | Drop "Find anything" from the features | Yes. |
| 7 | A closing prompt in place of the FAQ's sign-up card | Yes. |
| 8 | A plain-language line for each plan's allowance | Needed, but blocked: the allowances have to be settled first (below). |
| 9 | GitHub link and maker credit in the footer | Owner's call. It is strong proof for a technical visitor. |
| 10 | Privacy and Terms pages | Needed before wide sharing. Short, plain pages are enough. |

**On decision 8.** A real two-file build was measured at about 70,000 tokens. The allowances were first 5,000 (Free), 100,000 (Pro) and 500,000 (Business), which left Free below one build and Pro at about one. On 2026-10-06 the owner set them to 100,000, 300,000 and 1,000,000 a day, which is about one, four and fourteen builds.

---

## 6. Assets to make before the UI phase

| Asset | For | How |
|---|---|---|
| Six generated apps, captured running | Section 3 | Build each prompt with the product, capture the preview |
| One build recorded end to end (habit tracker, then "add a weekly view") | Hero window script | Run it once for real so the replica shows true file names and output |
| A real Teach me note and a real ExplainLLM answer | Section 4 | Take them from that same build |
| Privacy and Terms text | Footer | Write short versions |

---

## 7. Order of work after this plan is approved

One section at a time, each shown before the next is started.

1. Hero (headline, line, prompt, window)
2. How it works
3. Understand
4. Features
5. What you can build (once the captures exist)
6. Pricing
7. FAQ and closing call
8. Footer and navigation
9. Swap the new page in at `/` and remove the old one, on approval
