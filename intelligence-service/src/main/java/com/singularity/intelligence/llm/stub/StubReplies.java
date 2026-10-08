package com.singularity.intelligence.llm.stub;

import com.singularity.intelligence.llm.CodeInsightPrompts;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * What the stub model answers, chosen from what it was asked.
 *
 * <p>Handles: telling which of the service's calls a request is - a build turn, the idea interview, the compiled
 * brief, a step lesson, the suggestions under a build, or a question about code - from its system prompt, and writing
 * the reply that call's real parser expects: a small notes app in the build protocol on a first build, one further
 * component and an edit on the next request, a closing word on a repair or a continuation, a question for a request
 * outside the stack, and plain words for a question about the project.
 *
 * <p>A build turn's first call carries the shape of a reply under the request ({@code PromptUtils.replyShape}); a
 * call that carries a reply on or repairs one does not. That is how the two are told apart here, with no need to
 * know how each of those later requests is worded.
 *
 * <p>The build replies are written against the project as the call was shown it, not from a fixed script. An edit
 * names lines of a file as it is now, so a script that always edited the starter page's title would fail on any
 * project that was not fresh from the template - and a failed edit sends the turn into a repair, which is the one
 * path a stub should never wander into by accident. So a step is only written when the text it searches for is in
 * the project the call was given, and a project that already holds everything gets words, not files.
 *
 * <p>The app it writes uses plain Tailwind utilities and one icon package the starter template installs, so it
 * compiles and runs on the template whatever component kit that ships. It is a real, working app on purpose: the
 * end-to-end test opens its preview.
 */
public final class StubReplies {

    public enum Call {
        BUILD,
        INTERVIEW,
        BRIEF,
        LESSON,
        SUGGEST,
        ANSWER
    }

    static final String BUILDER_PROMPT_OPENING = "You are Singularity's builder";
    static final String INTERVIEW_PROMPT_OPENING = "You run a short interview";
    static final String BRIEF_PROMPT_OPENING = "You turn an app idea";
    static final String SUGGEST_PROMPT_OPENING = "You suggest what to build next";
    static final String REPLY_SHAPE_MARKER = "\n\n---\n(Reply format, added by the system";
    static final String TEMPLATE_TITLE = "    <title>New project</title>";
    static final String NOTE_LIST_LINE = "        <NoteList notes={notes} onRemove={remove} />";

    private static final Pattern OTHER_STACK = Pattern.compile(
            "\\b(vue|angular|svelte|next\\.?js|python|django|flask|flutter|php|laravel)\\b", Pattern.CASE_INSENSITIVE);

    private StubReplies() {
    }

    public static Call callOf(String systemPrompt) {
        String prompt = systemPrompt == null ? "" : systemPrompt.stripLeading();
        if (prompt.startsWith(BUILDER_PROMPT_OPENING)) return Call.BUILD;
        if (prompt.startsWith(INTERVIEW_PROMPT_OPENING)) return Call.INTERVIEW;
        if (prompt.startsWith(BRIEF_PROMPT_OPENING)) return Call.BRIEF;
        if (prompt.startsWith(SUGGEST_PROMPT_OPENING)) return Call.SUGGEST;
        if (prompt.equals(CodeInsightPrompts.lessonSystemPrompt().stripLeading())) return Call.LESSON;
        return Call.ANSWER;
    }

    public static String replyTo(Call call, String project, String request) {
        return switch (call) {
            case BUILD -> build(project == null ? "" : project, request == null ? "" : request);
            case INTERVIEW -> INTERVIEW;
            case BRIEF -> BRIEF;
            case LESSON -> LESSON;
            case SUGGEST -> SUGGESTIONS;
            case ANSWER -> ANSWER;
        };
    }

    private static String build(String project, String sent) {
        int shape = sent.indexOf(REPLY_SHAPE_MARKER);
        if (shape < 0) {
            return "<message>That is everything for this change.</message>";
        }
        String request = sent.substring(0, shape).strip();
        if (OTHER_STACK.matcher(request).find()) {
            return "<message>This workspace builds React apps, so I can't write that one as asked.</message>\n"
                    + "<ask options=\"Yes, build it in React|No, leave it\">Shall I build the same thing in React?</ask>";
        }
        boolean hasNotes = project.contains("START OF FILE: src/components/NoteList.tsx");
        boolean hasCount = project.contains("START OF FILE: src/components/NoteCount.tsx");
        if (request.endsWith("?") && request.length() < 200 && !request.toLowerCase(Locale.ROOT).startsWith("can you")) {
            return "<message>" + (hasNotes
                    ? "The page in src/pages/Index.tsx holds the notes in state and saves them to the browser through "
                    + "src/lib/notes.ts; NoteList draws them."
                    : "This is the starter project: one page at src/pages/Index.tsx, routed from src/App.tsx.")
                    + "</message>";
        }
        if (!hasNotes) {
            return firstBuild(project.contains(TEMPLATE_TITLE));
        }
        if (!hasCount && project.contains(NOTE_LIST_LINE)) {
            return CHANGE;
        }
        return "<message>The notes app already has its list and its counter, so there was nothing to change. "
                + "Tell me what you would like added next.</message>";
    }

    private static String firstBuild(boolean namesThePage) {
        StringBuilder reply = new StringBuilder(FIRST_BUILD_PLAN);
        if (namesThePage) {
            reply.append("<todo path=\"index.html\">Naming the page</todo>\n");
        }
        reply.append(FIRST_BUILD_FILES);
        if (namesThePage) {
            reply.append("""
                    <edit path="index.html">
                    <<<<<<< SEARCH
                        <title>New project</title>
                    =======
                        <title>Quick Notes</title>
                    >>>>>>> REPLACE
                    </edit>
                    """);
        }
        return reply.append("<message>Type a note and press Enter to keep it, and use the bin beside a note to remove "
                + "it. Notes stay in this browser after a refresh.</message>").toString();
    }

    private static final String FIRST_BUILD_PLAN = """
            <approach>One screen, so no routing changes: a page, one list component and one small module for storage.
            There is no server here, so notes live in localStorage behind src/lib/notes.ts.
            A warm paper palette, kept to plain utilities so it reads the same in any theme.</approach>
            <message>Starting with where notes are kept, then the list that shows them.</message>
            <todo path="src/lib/notes.ts">Keeping notes in the browser</todo>
            <todo path="src/components/NoteList.tsx">Listing the notes</todo>
            <todo path="src/pages/Index.tsx">Putting the page together</todo>
            """;

    private static final String FIRST_BUILD_FILES = """
            <file path="src/lib/notes.ts">export interface Note {
              id: string;
              text: string;
              createdAt: number;
            }

            const STORAGE_KEY = "quick-notes";

            export function loadNotes(): Note[] {
              try {
                const stored = localStorage.getItem(STORAGE_KEY);
                return stored ? (JSON.parse(stored) as Note[]) : [];
              } catch {
                return [];
              }
            }

            export function saveNotes(notes: Note[]): void {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
            }

            export function createNote(text: string): Note {
              return { id: crypto.randomUUID(), text, createdAt: Date.now() };
            }
            </file>
            <file path="src/components/NoteList.tsx">import { Trash2 } from "lucide-react";
            import type { Note } from "../lib/notes";

            interface NoteListProps {
              notes: Note[];
              onRemove: (id: string) => void;
            }

            export function NoteList({ notes, onRemove }: NoteListProps) {
              if (notes.length === 0) {
                return <p className="py-10 text-center text-sm opacity-60">No notes yet. Write the first one above.</p>;
              }

              return (
                <ul className="space-y-2">
                  {notes.map((note) => (
                    <li
                      key={note.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-stone-900/10 bg-white/70 p-3"
                    >
                      <span className="whitespace-pre-wrap break-words">{note.text}</span>
                      <button
                        type="button"
                        aria-label="Delete note"
                        className="shrink-0 rounded-md p-1 opacity-60 transition hover:opacity-100"
                        onClick={() => onRemove(note.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              );
            }
            </file>
            <file path="src/pages/Index.tsx">import { useEffect, useState } from "react";
            import type { FormEvent } from "react";
            import { NoteList } from "../components/NoteList";
            import { createNote, loadNotes, saveNotes } from "../lib/notes";
            import type { Note } from "../lib/notes";

            const Index = () => {
              const [notes, setNotes] = useState<Note[]>(loadNotes);
              const [draft, setDraft] = useState("");

              useEffect(() => {
                saveNotes(notes);
              }, [notes]);

              const add = (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const text = draft.trim();
                if (!text) return;
                setNotes((current) => [createNote(text), ...current]);
                setDraft("");
              };

              const remove = (id: string) => setNotes((current) => current.filter((note) => note.id !== id));

              return (
                <main className="min-h-screen bg-amber-50 px-4 py-12 text-stone-900">
                  <div className="mx-auto max-w-xl space-y-6">
                    <h1 className="text-3xl font-semibold tracking-tight">Quick Notes</h1>
                    <form onSubmit={add} className="flex gap-2">
                      <input
                        aria-label="New note"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="Write a note and press Enter"
                        className="min-w-0 flex-1 rounded-lg border border-stone-900/20 bg-white px-3 py-2 outline-none focus:border-stone-900"
                      />
                      <button type="submit" className="rounded-lg bg-stone-900 px-4 py-2 font-medium text-amber-50">
                        Add
                      </button>
                    </form>
                    <NoteList notes={notes} onRemove={remove} />
                  </div>
                </main>
              );
            };

            export default Index;
            </file>
            """;

    private static final String CHANGE = """
            <approach>A count is one line of display, so it gets its own small component and the page only places it.
            It reads the same notes the list does, so there is no new state.</approach>
            <message>Adding the counter as its own component, then placing it above the list.</message>
            <todo path="src/components/NoteCount.tsx">Counting the notes</todo>
            <todo path="src/pages/Index.tsx">Showing the count on the page</todo>
            <file path="src/components/NoteCount.tsx">interface NoteCountProps {
              count: number;
            }

            export function NoteCount({ count }: NoteCountProps) {
              const label = count === 1 ? "1 note" : `${count} notes`;
              return <p className="text-sm opacity-70">{label}</p>;
            }
            </file>
            <edit path="src/pages/Index.tsx">
            <<<<<<< SEARCH
            import { NoteList } from "../components/NoteList";
            =======
            import { NoteCount } from "../components/NoteCount";
            import { NoteList } from "../components/NoteList";
            >>>>>>> REPLACE
            <<<<<<< SEARCH
                    <NoteList notes={notes} onRemove={remove} />
            =======
                    <NoteCount count={notes.length} />
                    <NoteList notes={notes} onRemove={remove} />
            >>>>>>> REPLACE
            </edit>
            <message>The number of notes now shows above the list and follows every add and delete.</message>""";

    private static final String INTERVIEW = """
            {"questions":[
            {"id":"audience","question":"Who is this for?","helper":"It decides how much to explain on screen.",\
            "options":["Just me","A small team","Anyone who opens it"],"multiSelect":false},
            {"id":"look","question":"How should it look?","helper":"Pick the closest; it can change later.",\
            "options":["Calm and minimal","Bold and colourful","Dark and focused"],"multiSelect":false}
            ]}""";

    private static final String BRIEF = """
            **Build:** A quick notes app for jotting things down and finding them again.
            **For:** One person, in their own browser.
            **Core action:** Type a note, press Enter, and see it at the top of the list; delete it when done.
            **Look and feel:** Calm and minimal, on a warm paper background.
            **Keep it simple:**
            - No accounts or syncing
            - No folders or tags""";

    private static final String LESSON = """
            This step creates the piece the request needed first, so the steps after it have something to build on.

            ### L1 · Where the file starts

            The first line sets up what the rest of the file uses. Everything below it depends on it being there.

            ### What happens next

            The next step uses what this one set up.""";

    private static final String SUGGESTIONS = """
            Add a search box that filters the notes
            Let me pin a note to the top
            Add a dark theme switch""";

    private static final String ANSWER = "This is the stub model's answer. It reads no code and costs no tokens; "
            + "run the service without the `stub-ai` profile for a real explanation.";
}
