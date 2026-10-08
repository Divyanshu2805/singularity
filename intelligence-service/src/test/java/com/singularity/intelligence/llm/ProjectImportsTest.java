package com.singularity.intelligence.llm;

import com.singularity.intelligence.llm.ProjectImports.Kind;
import com.singularity.intelligence.llm.ProjectImports.Problem;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the import check a turn's files go through before they are saved: the missing file and missing package it
 * must report, the ways a real import resolves that it must accept, and everything it must leave alone because it
 * cannot be sure.
 *
 * <p>The first case is the one from production - a page importing a hook that was planned and never written.
 */
class ProjectImportsTest {

    private static final String PACKAGE_JSON = """
            {
              "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1", "@tanstack/react-query": "^5.62.7", "lucide-react": "^0.562.0" },
              "devDependencies": { "vite": "^6.0.5", "@vitejs/plugin-react": "^4.3.4" }
            }
            """;

    private static final Set<String> TEMPLATE = Set.of(
            "package.json", "index.html", "vite.config.js", "src/main.tsx", "src/App.tsx", "src/App.css",
            "src/index.css", "src/pages/Index.tsx", "src/pages/NotFound.tsx", "src/assets/react.svg");

    private static Set<String> with(String... paths) {
        Set<String> all = new java.util.HashSet<>(TEMPLATE);
        all.addAll(List.of(paths));
        return all;
    }

    @Test
    void aPageImportingAHookThatWasNeverWrittenIsReported() {
        String index = """
                import { CheckCheck } from "lucide-react";
                import AddTodo from "../components/AddTodo";
                import { useTodos } from "../hooks/useTodos";

                export default function Index() { return null; }
                """;

        List<Problem> problems = ProjectImports.unresolved(
                with("src/components/AddTodo.tsx"), Map.of("src/pages/Index.tsx", index), PACKAGE_JSON);

        assertThat(problems).containsExactly(new Problem("src/pages/Index.tsx", "../hooks/useTodos", Kind.MISSING_FILE));
        assertThat(problems.getFirst().describe()).contains("src/pages/Index.tsx").contains("../hooks/useTodos");
    }

    @Test
    void theSameImportResolvesOnceTheHookExists() {
        String index = "import { useTodos } from \"../hooks/useTodos\";\n";

        assertThat(ProjectImports.unresolved(with("src/hooks/useTodos.ts"), Map.of("src/pages/Index.tsx", index), PACKAGE_JSON))
                .isEmpty();
    }

    @Test
    void aPackageThatIsNotInPackageJsonIsReportedOnceByTheNameItIsImportedAs() {
        String app = """
                import { motion } from "framer-motion";
                import { useQuery } from "@tanstack/react-query";
                import ReactDOM from "react-dom/client";
                import confetti from "canvas-confetti/dist/confetti.module.mjs";
                """;

        List<Problem> problems = ProjectImports.unresolved(TEMPLATE, Map.of("src/App.tsx", app), PACKAGE_JSON);

        assertThat(problems).containsExactly(
                new Problem("src/App.tsx", "framer-motion", Kind.MISSING_PACKAGE),
                new Problem("src/App.tsx", "canvas-confetti/dist/confetti.module.mjs", Kind.MISSING_PACKAGE));
    }

    @Test
    void everyWayARealImportIsWrittenIsAccepted() {
        String source = """
                import "./App.css";
                import logo from "./assets/react.svg";
                import raw from "./assets/react.svg?raw";
                import Index from "@/pages/Index";
                import * as pages from "./pages";
                import type { Thing } from "./types/thing.js";
                import {
                  one,
                  two,
                } from "./lib/many";
                export { default as NotFound } from "./pages/NotFound";
                export * from "./lib/many";
                const Lazy = () => import("./pages/Index");
                """;

        Set<String> paths = with("src/pages/index.ts", "src/types/thing.ts", "src/lib/many.ts");

        assertThat(ProjectImports.unresolved(paths, Map.of("src/App.tsx", source), PACKAGE_JSON)).isEmpty();
    }

    @Test
    void theConfigFilesBuiltInsAndDevDependenciesAreNotMistakenForMissingPackages() {
        String viteConfig = """
                import { defineConfig } from "vite";
                import react from "@vitejs/plugin-react";
                import { resolve } from "node:path";
                import fs from "fs";
                """;

        assertThat(ProjectImports.unresolved(TEMPLATE, Map.of("vite.config.js", viteConfig), PACKAGE_JSON)).isEmpty();
    }

    @Test
    void aCodeSampleShownInsideAPageIsNotReadAsAnImport() {
        String docs = """
                export default function Docs() {
                  return <pre>{`const hint = 1; import { missing } from "./nowhere";`}</pre>;
                }
                const text = "you can import x from 'left-pad' if you like";
                """;

        assertThat(ProjectImports.unresolved(TEMPLATE, Map.of("src/pages/Docs.tsx", docs), PACKAGE_JSON)).isEmpty();
    }

    @Test
    void anExportThatIsNotAReExportDoesNotBorrowALaterFromClause() {
        String source = """
                export const quote = 1
                const line = `as heard from "nowhere-at-all"`
                """;

        assertThat(ProjectImports.specifiers(source)).isEmpty();
    }

    @Test
    void packagesAreNotCheckedWhenPackageJsonIsMissingOrUnreadable() {
        String app = "import { motion } from \"framer-motion\";\n";

        assertThat(ProjectImports.unresolved(TEMPLATE, Map.of("src/App.tsx", app), null)).isEmpty();
        assertThat(ProjectImports.unresolved(TEMPLATE, Map.of("src/App.tsx", app), "{ not json")).isEmpty();
    }

    @Test
    void aPathThatClimbsOutOfTheProjectIsLeftAlone() {
        assertThat(ProjectImports.unresolved(TEMPLATE, Map.of("src/main.tsx", "import x from \"../../outside\";\n"), PACKAGE_JSON))
                .isEmpty();
    }

    @Test
    void onlyScriptsAreRead() {
        String css = "@import \"./missing.css\";\nimport x from './missing';\n";

        assertThat(ProjectImports.unresolved(TEMPLATE, Map.of("src/index.css", css, "README.md", css), PACKAGE_JSON)).isEmpty();
    }

    @Test
    void theReportIsCappedSoOneBadFileCannotFillThePrompt() {
        StringBuilder source = new StringBuilder();
        for (int index = 0; index < 30; index++) {
            source.append("import a").append(index).append(" from \"./missing").append(index).append("\";\n");
        }

        assertThat(ProjectImports.unresolved(TEMPLATE, Map.of("src/App.tsx", source.toString()), PACKAGE_JSON))
                .hasSize(ProjectImports.MAX_PROBLEMS);
    }
}
