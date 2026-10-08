package com.singularity.intelligence.llm;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.Engine;
import org.graalvm.polyglot.Source;
import org.graalvm.polyglot.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;

/**
 * Says whether the files a build turn is about to save will parse.
 *
 * <p>Handles: parsing each written JavaScript or TypeScript file with the Babel parser - the one the preview's bundler
 * uses, so a file that passes here is not refused there for its syntax - and package.json as JSON; reporting the
 * first error in each file with its line, its column and the lines around it; and staying out of the way when it
 * cannot run.
 *
 * <p>Before this, nothing between the model and storage parsed the code a turn wrote. The import check reads import
 * lines and the type-check before publishing is off by default, so a file with a stray character in it was saved, the
 * turn was reported as a success, and the person found out from the bundler's stack trace in the preview. One such
 * artifact has its own guard ({@link StrayBackslashes}); this is the general one, and what it finds is handed back to
 * the model to repair before the turn is saved.
 *
 * <p>The parser is JavaScript and runs inside this process on GraalJS, with no access to the host: no files, no
 * network, no Java classes. The code being checked is handed to it as a string argument and is only ever parsed -
 * never evaluated, never made part of the script that runs. Generated code still executes only in a preview pod.
 *
 * <p>The parser itself is not kept in this repository. It is the published {@code @babel/parser} package, brought in
 * as a Maven dependency (its WebJar, version in the root pom.xml), and found on the classpath through the version the
 * jar states about itself, so the pom is the only place that version is written.
 *
 * <p>GraalJS is used rather than a native parser because the service's image is Alpine, where a library built against
 * glibc does not load; and rather than a pod, because a check that needs a cluster would be skipped exactly when it
 * is wanted. On a stock JVM it interprets: loading the parser takes a second or two, which happens once, in the
 * background, when the service starts, and a file then takes around a tenth of a second.
 *
 * <p>It fails open. If the engine cannot start, or a file makes the parser itself throw something that is not a
 * syntax error, the file is treated as fine and the reason is logged - a turn is never lost to its own safety check.
 * Only one check runs at a time, since a context is not safe for two threads at once and a turn's files are few.
 *
 * <p>Only package.json is read as JSON. The other JSON files of a project (tsconfig and its kin) allow comments,
 * which a strict reader would report as errors.
 */
@Component
@Slf4j
public class SyntaxCheck {

    public record Problem(String path, int line, int column, String message, String excerpt) {

        public String describe() {
            return path + " line " + line + ": " + message;
        }
    }

    private static final String PARSER_COORDINATES = "/META-INF/maven/org.webjars.npm/babel__parser/pom.properties";
    private static final String PARSER_ROOT = "/META-INF/resources/webjars/babel__parser/";
    private static final String PARSER_FILE = "/lib/index.js";
    private static final String PACKAGE_JSON = "package.json";
    private static final int MAX_CHECKED_CHARS = 400_000;
    private static final int EXCERPT_LINES_AROUND = 2;
    private static final int MAX_EXCERPT_LINE_CHARS = 240;
    private static final String CHECK_FUNCTION = """
            (function (code, plugins) {
              try {
                exports.parse(code, { sourceType: 'module', plugins: plugins.split(',') });
                return '';
              } catch (error) {
                if (!error || !error.loc) throw error;
                return error.loc.line + ':' + error.loc.column + ':' + String(error.message);
              }
            })""";

    private final Object lock = new Object();
    private final JsonMapper jsonMapper = JsonMapper.builder().build();
    private Engine engine;
    private Context context;
    private Value check;
    private boolean unavailable;

    @EventListener(ApplicationReadyEvent.class)
    public void warmUp() {
        Thread.ofPlatform().name("syntax-check-warm-up").daemon(true).start(() -> {
            synchronized (lock) {
                if (ready()) {
                    log.info("The syntax check for generated files is ready");
                }
            }
        });
    }

    public List<Problem> check(Map<String, String> files) {
        List<Problem> problems = new ArrayList<>();
        files.forEach((path, content) -> {
            Problem problem = checkOne(path, content);
            if (problem != null) {
                problems.add(problem);
            }
        });
        return problems;
    }

    Problem checkOne(String path, String content) {
        if (path == null || content == null || content.length() > MAX_CHECKED_CHARS) {
            return null;
        }
        if (path.equals(PACKAGE_JSON)) {
            return checkJson(path, content);
        }
        String plugins = pluginsFor(path);
        if (plugins == null) {
            return null;
        }
        synchronized (lock) {
            if (!ready()) {
                return null;
            }
            try {
                String outcome = check.execute(content, plugins).asString();
                if (outcome.isEmpty()) {
                    return null;
                }
                String[] parts = outcome.split(":", 3);
                int line = Integer.parseInt(parts[0]);
                int column = Integer.parseInt(parts[1]) + 1;
                return new Problem(path, line, column, withoutPosition(parts[2]), excerpt(content, line));
            } catch (RuntimeException e) {
                log.warn("Couldn't check the syntax of {} - treating it as fine", path, e);
                return null;
            }
        }
    }

    private Problem checkJson(String path, String content) {
        try {
            jsonMapper.readTree(content);
            return null;
        } catch (JacksonException e) {
            int line = e.getLocation() == null ? 1 : Math.max(1, e.getLocation().getLineNr());
            int column = e.getLocation() == null ? 1 : Math.max(1, e.getLocation().getColumnNr());
            return new Problem(path, line, column, "this is not valid JSON - " + e.getOriginalMessage(),
                    excerpt(content, line));
        }
    }

    private static String pluginsFor(String path) {
        int dot = path.lastIndexOf('.');
        String extension = dot < 0 ? "" : path.substring(dot + 1).toLowerCase(Locale.ROOT);
        return switch (extension) {
            case "tsx" -> "typescript,jsx";
            case "ts", "mts", "cts" -> "typescript";
            case "jsx", "js", "mjs", "cjs" -> "jsx";
            default -> null;
        };
    }

    private boolean ready() {
        if (check != null) {
            return true;
        }
        if (unavailable) {
            return false;
        }
        try {
            String script = parserScript();
            engine = Engine.newBuilder("js").option("engine.WarnInterpreterOnly", "false").build();
            context = Context.newBuilder("js").engine(engine).allowAllAccess(false).build();
            context.eval("js", "var exports = {}; var module = { exports: exports };");
            context.eval(Source.newBuilder("js", script, "babel-parser.js").buildLiteral());
            check = context.eval("js", CHECK_FUNCTION);
            return true;
        } catch (IOException | RuntimeException | LinkageError e) {
            unavailable = true;
            log.error("The syntax check for generated files could not start - files will be saved unchecked", e);
            close();
            return false;
        }
    }

    private static String parserScript() throws IOException {
        Properties coordinates = new Properties();
        try (InputStream in = SyntaxCheck.class.getResourceAsStream(PARSER_COORDINATES)) {
            if (in == null) {
                throw new IOException("The parser is missing from the classpath: " + PARSER_COORDINATES);
            }
            coordinates.load(in);
        }
        String resource = PARSER_ROOT + coordinates.getProperty("version") + PARSER_FILE;
        try (InputStream parser = SyntaxCheck.class.getResourceAsStream(resource)) {
            if (parser == null) {
                throw new IOException("The parser is missing from the classpath: " + resource);
            }
            return new String(parser.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @PreDestroy
    public void close() {
        synchronized (lock) {
            check = null;
            try {
                if (context != null) {
                    context.close(true);
                }
                if (engine != null) {
                    engine.close(true);
                }
            } catch (RuntimeException e) {
                log.debug("Closing the syntax check's engine failed", e);
            } finally {
                context = null;
                engine = null;
            }
        }
    }

    private static String withoutPosition(String message) {
        return message.replaceFirst("\\s*\\(\\d+:\\d+\\)\\s*$", "");
    }

    public static String excerpt(String content, int line) {
        String[] lines = content.replace("\r\n", "\n").split("\n", -1);
        int from = Math.max(1, line - EXCERPT_LINES_AROUND);
        int to = Math.min(lines.length, line + EXCERPT_LINES_AROUND);
        StringBuilder excerpt = new StringBuilder();
        for (int number = from; number <= to; number++) {
            String text = lines[number - 1];
            excerpt.append(number == line ? "> " : "  ").append(number).append(" | ")
                    .append(text.length() > MAX_EXCERPT_LINE_CHARS ? text.substring(0, MAX_EXCERPT_LINE_CHARS) + "..." : text)
                    .append('\n');
        }
        return excerpt.toString();
    }
}
