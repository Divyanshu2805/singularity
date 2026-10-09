package com.singularity.intelligence.llm;

import com.singularity.intelligence.llm.SyntaxCheck.Problem;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers parsing the files a build turn is about to save.
 *
 * <p>The first case is the line a real turn saved - a backslash after an opening parenthesis in a page's JSX - and
 * the message is the one the preview's bundler showed for it, which is the point of using the same parser. The rest
 * are what must not be reported: valid TypeScript and JSX of the kinds a generated app is made of, a generic in a
 * plain TypeScript file, and files this check has no business reading.
 *
 * <p>These run the real parser on the real engine, so the class shares one instance: starting it takes a second or
 * two.
 */
class SyntaxCheckTest {

    private static final SyntaxCheck CHECK = new SyntaxCheck();

    @AfterAll
    static void close() {
        CHECK.close();
    }

    @Test
    void theBackslashARealTurnLeftInAPageIsReportedWithItsLineAndTheBundlersOwnMessage() {
        String page = """
                export function Inquire() {
                  const isSubmitted = false;
                  return (
                    <div>
                      {isSubmitted ? (\\
                        <p>Thanks.</p>
                      ) : null}
                    </div>
                  );
                }
                """;

        Problem problem = CHECK.checkOne("src/pages/Inquire.tsx", page);

        assertThat(problem).isNotNull();
        assertThat(problem.line()).isEqualTo(5);
        assertThat(problem.message()).isEqualTo("Expecting Unicode escape sequence \\uXXXX.");
        assertThat(problem.excerpt()).contains("> 5 |       {isSubmitted ? (\\").contains("  4 |     <div>");
        assertThat(problem.describe()).startsWith("src/pages/Inquire.tsx line 5: ");
    }

    @Test
    void aBraceThatWasNeverClosedIsReported() {
        Problem problem = CHECK.checkOne("src/lib/total.ts", "export function total(a: number, b: number) {\n  return a + b;\n");

        assertThat(problem).isNotNull();
        assertThat(problem.line()).isEqualTo(3);
    }

    @Test
    void theCodeAGeneratedAppIsMadeOfIsNotReported() {
        Map<String, String> files = new LinkedHashMap<>();
        files.put("src/pages/Index.tsx", """
                import { useState, type FC } from "react";
                import type { Todo } from "@/types/todo";

                interface Props { items: Todo[]; onPick?: (todo: Todo) => void }

                export const Index: FC<Props> = ({ items, onPick }) => {
                  const [open, setOpen] = useState<Record<string, boolean>>({});
                  const label = `Showing ${items.length} item${items.length === 1 ? "" : "s"}`;
                  return (
                    <main className="p-4">
                      <h1>Don't lose a task :)</h1>
                      {items.map((item) => (
                        <button key={item.id} onClick={() => { setOpen({ ...open, [item.id]: !open[item.id] }); onPick?.(item); }}>
                          {item.title satisfies string}
                        </button>
                      ))}
                      <p>{label}</p>
                    </main>
                  );
                };
                """);
        files.put("src/lib/storage.ts", """
                export enum Kind { Draft, Done }
                export const first = <T,>(items: T[]): T | undefined => items[0];
                export function load<T>(key: string, fallback: T): T {
                  const raw = localStorage.getItem(key);
                  return raw ? (JSON.parse(raw) as T) : fallback;
                }
                """);
        files.put("vite.config.js", "export default { plugins: [], server: { port: 5173 } };\n");
        files.put("package.json", "{ \"name\": \"app\", \"dependencies\": { \"react\": \"^18.3.1\" } }\n");

        assertThat(CHECK.check(files)).isEmpty();
    }

    @Test
    void aPackageJsonThatIsNotJsonIsReported() {
        Problem problem = CHECK.checkOne("package.json", "{\n  \"name\": \"app\",\n  \"dependencies\": { \"react\": \"^18.3.1\", }\n}\n");

        assertThat(problem).isNotNull();
        assertThat(problem.line()).isEqualTo(3);
        assertThat(problem.message()).startsWith("this is not valid JSON");
    }

    @Test
    void filesThatAreNotScriptsAreNotRead() {
        Map<String, String> files = new LinkedHashMap<>();
        files.put("src/index.css", "@import \"tailwindcss\";\n.card { color: red;\n");
        files.put("index.html", "<div><p>unclosed");
        files.put("tsconfig.json", "{ // comments are allowed here\n  \"compilerOptions\": {} }\n");
        files.put("README.md", "# {{ not code");

        assertThat(CHECK.check(files)).isEmpty();
    }

    @Test
    void everyFileWithAnErrorIsReportedOncePerFile() {
        Map<String, String> files = new LinkedHashMap<>();
        files.put("src/a.ts", "export const a = ;\n");
        files.put("src/b.ts", "export const b = 1;\n");
        files.put("src/c.tsx", "export const C = () => <div>;\n");

        List<Problem> problems = CHECK.check(files);

        assertThat(problems).extracting(Problem::path).containsExactly("src/a.ts", "src/c.tsx");
    }

    @Test
    void aFileTheParserCannotFinishIsStoppedAndTheNextFileIsStillChecked() {
        SyntaxCheck limited = new SyntaxCheck(java.time.Duration.ofSeconds(2));
        try {
            assertThat(limited.checkOne("src/warm.ts", "export const a = 1;\n")).isNull();
            String nested = "f(" + "<T>(".repeat(40) + "x" + ")".repeat(40) + ");\n";

            long started = System.nanoTime();
            Problem stopped = limited.checkOne("src/nested.ts", nested);
            long seconds = java.time.Duration.ofNanos(System.nanoTime() - started).toSeconds();

            assertThat(stopped).isNull();
            assertThat(seconds).isLessThan(20);
            assertThat(limited.checkOne("src/after.ts", "export const b = ;\n")).isNotNull();
        } finally {
            limited.close();
        }
    }
}
