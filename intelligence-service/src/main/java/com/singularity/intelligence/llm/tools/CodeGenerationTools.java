package com.singularity.intelligence.llm.tools;

import com.singularity.intelligence.llm.FileFence;
import com.singularity.intelligence.service.ProjectFileReader;
import feign.FeignException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.ai.tool.execution.ToolCallResultConverter;

import java.lang.reflect.Type;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

/**
 * The one tool the model is given: reading files it can see in the file tree.
 *
 * <p>Handles: resolving each requested path, returning its content wrapped in markers the model can read, bounding
 * how many files one call may ask for, and telling the caller about it twice over: that the tool was invoked at all -
 * which is how the code lens knows to drop the line the model said just before it - and which files were actually
 * fetched, which is how a build turn shows "Reading 6 files" and records the read in its transcript without relying
 * on the model to announce it.
 *
 * <p>A file that genuinely does not exist and a file that could not be read are reported differently on purpose.
 * Telling the model a file is absent when it is merely unreadable makes it recreate the file, losing whatever was in
 * it.
 *
 * <p>What it returns reaches the model as plain text ({@link PlainText}). The default was JSON: a list of strings,
 * every line break in a file written as {@code \n} and every quote as {@code \"}. A model asked to change part of
 * a file has to copy its lines exactly, and one that had read a file that way copied the escapes with them - a run
 * of five lines on one line with {@code \n} between them, which is in no file.
 *
 * <p>This is typed against the read-only file reader, not the write-capable workspace client, so a future edit that
 * tried to add a write here fails to compile.
 *
 * <p>Two guards bound a single turn's cost, both discovered from a production turn that made 21 {@code read_files}
 * calls re-reading the same two files roughly every 10 seconds and never wrote a fix - 875k tokens for a no-op,
 * because a growing conversation (every earlier tool result included) is resent to the model on every round. A path
 * already returned in full this turn is answered with a short pointer back to it instead of its content again,
 * since the model still has it a few messages up - this is what actually stops the resend from compounding, rather
 * than merely preventing new duplicate content from being added. Once {@link #MAX_CALLS} calls have been made without
 * a written change, every further read is refused with an instruction to answer with what's already in hand, so a
 * turn that is not converging fails fast instead of quietly burning the daily budget. A build turn also tells the
 * tool which files it already showed the model with the prompt, and those are answered the same short way, since
 * sending a file the model is already holding only teaches it that asking again works. Such a turn is also allowed
 * fewer calls ({@link #MAX_CALLS_WHEN_FILES_WERE_SHOWN}): with the project's main files in hand, one call for the
 * rest is the expected number, and a model still calling after three is exploring. A build turn may also give the
 * tool a note to end every answer with: what a model reads last is what it follows, and one that had just been handed
 * a page of file content wrote its reply as plain prose, so the build's format reminder goes after the files. The
 * note is the caller's; the tool has none of its own, and the code lens passes none. A build turn is also handed each
 * file's content as it is read, so it can put that file in front of the turn's later calls itself. Both counters are per-instance,
 * and a fresh instance is built for each call to the model ({@code BuildTurn}), so neither leaks across turns - nor
 * across the calls of one turn, which is deliberate: a reply that is carried on is sent without the earlier call's
 * tool results, so a file read then is no longer "further up in this conversation" and must be readable again.
 */
@Slf4j
public class CodeGenerationTools {

    public static final class PlainText implements ToolCallResultConverter {

        @Override
        public String convert(Object result, Type returnType) {
            if (result instanceof List<?> parts) {
                StringBuilder text = new StringBuilder();
                for (Object part : parts) {
                    text.append(text.isEmpty() ? "" : "\n\n").append(part);
                }
                return text.toString();
            }
            return result == null ? "" : result.toString();
        }
    }

    static final int MAX_FILES_PER_CALL = 25;
    static final int MAX_CALLS = 6;
    static final int MAX_CALLS_WHEN_FILES_WERE_SHOWN = 3;

    private final ProjectFileReader projectFileReader;
    private final Long projectId;
    private final Runnable onInvoke;
    private final Consumer<List<String>> onRead;
    private final Set<String> alreadyReadInFull = new HashSet<>();
    private final Set<String> alreadyShown = new HashSet<>();
    private final AtomicInteger callCount = new AtomicInteger(0);
    private int maxCalls = MAX_CALLS;
    private String afterEveryRead;
    private BiConsumer<String, String> onContent = (path, content) -> { };

    public CodeGenerationTools(ProjectFileReader projectFileReader, Long projectId) {
        this(projectFileReader, projectId, () -> { }, paths -> { });
    }

    public CodeGenerationTools(ProjectFileReader projectFileReader, Long projectId, Runnable onInvoke) {
        this(projectFileReader, projectId, onInvoke, paths -> { });
    }

    public CodeGenerationTools(ProjectFileReader projectFileReader, Long projectId, Consumer<List<String>> onRead) {
        this(projectFileReader, projectId, () -> { }, onRead);
    }

    public CodeGenerationTools(ProjectFileReader projectFileReader, Long projectId, Set<String> alreadyShown,
                               String afterEveryRead, Consumer<List<String>> onRead) {
        this(projectFileReader, projectId, () -> { }, onRead);
        this.alreadyShown.addAll(alreadyShown);
        this.maxCalls = alreadyShown.isEmpty() ? MAX_CALLS : MAX_CALLS_WHEN_FILES_WERE_SHOWN;
        this.afterEveryRead = afterEveryRead;
    }

    public CodeGenerationTools(ProjectFileReader projectFileReader, Long projectId, Set<String> alreadyShown,
                               String afterEveryRead, Consumer<List<String>> onRead, BiConsumer<String, String> onContent) {
        this(projectFileReader, projectId, alreadyShown, afterEveryRead, onRead);
        this.onContent = onContent;
    }

    private CodeGenerationTools(ProjectFileReader projectFileReader, Long projectId, Runnable onInvoke,
                                Consumer<List<String>> onRead) {
        this.projectFileReader = projectFileReader;
        this.projectId = projectId;
        this.onInvoke = onInvoke;
        this.onRead = onRead;
    }

    @Tool(name = "read_files", resultConverter = PlainText.class,
            description = "Read the content of files. Pass EVERY file you need in ONE call - the list can hold many paths. Only input file names present inside the FILE_TREE. DO NOT input any path which is not present under the FILE_TREE.")
    public List<String> readFiles(
            @ToolParam(description = "List of relative paths (e.g., ['src/App.tsx', 'src/main.tsx'])")
            List<String> paths
    ) {
        onInvoke.run();
        if (paths == null || paths.isEmpty()) {
            log.warn("read_files called with no paths");
            return List.of();
        }
        if (paths.size() > MAX_FILES_PER_CALL) {
            log.warn("read_files asked for {} files; reading the first {}", paths.size(), MAX_FILES_PER_CALL);
            paths = paths.subList(0, MAX_FILES_PER_CALL);
        }

        if (callCount.incrementAndGet() > maxCalls) {
            log.warn("read_files call {} for projectId {} exceeds the per-turn cap of {} - refusing further reads",
                    callCount.get(), projectId, maxCalls);
            return paths.stream()
                    .map(path -> String.format(
                            "--- READ LIMIT REACHED: %s --- (you have made too many separate read calls in this "
                                    + "turn and no more will be answered. Do not call read_files again. Write your "
                                    + "answer now, in exactly the output format you were given, using what you "
                                    + "already have; if you cannot finish without a file you have not seen, say so "
                                    + "in that answer)",
                            path))
                    .toList();
        }

        List<String> result = new ArrayList<>();
        onRead.accept(paths.stream().map(CodeGenerationTools::clean)
                .filter(path -> !alreadyReadInFull.contains(path) && !alreadyShown.contains(path)).toList());

        for(String path: paths) {
            String cleanPath = clean(path);

            if (alreadyShown.contains(cleanPath)) {
                log.info("Requested a file that was already shown with the prompt: {}", cleanPath);
                result.add(String.format(
                        "--- ALREADY SHOWN: %s --- (this file's full, current content was given to you at the start "
                                + "of this conversation, under FILES - use it from there and do not read it again)",
                        cleanPath
                ));
                continue;
            }

            if (!alreadyReadInFull.add(cleanPath)) {
                log.info("Re-requested file already read this turn: {}", cleanPath);
                result.add(String.format(
                        "--- ALREADY READ: %s --- (you read this earlier in this turn; its content is unchanged "
                                + "and is still further up in this conversation - do not re-fetch it, refer back "
                                + "to what you already have)",
                        cleanPath
                ));
                continue;
            }

            log.info("Requested file: {}", cleanPath);

            try {
                String content = projectFileReader.getFileContent(projectId, cleanPath).content();
                onContent.accept(cleanPath, content);

                result.add(String.format(
                        "--- START OF FILE: %s ---\n%s\n--- END OF FILE ---",
                        cleanPath, FileFence.guard(content)
                ));
            } catch (FeignException.NotFound e) {
                result.add(String.format(
                        "--- FILE NOT FOUND: %s --- (this file does not exist yet in this project)",
                        cleanPath
                ));
            } catch (Exception e) {
                log.error("Couldn't read '{}' of project {} for the model", cleanPath, projectId, e);
                result.add(String.format(
                        "--- COULD NOT READ: %s --- (this file exists but could not be read right now; do not "
                                + "recreate or overwrite it - say that you could not read it)",
                        cleanPath
                ));
            }
        }

        if (afterEveryRead != null && !afterEveryRead.isBlank()) {
            result.add(afterEveryRead);
        }
        return result;
    }

    private static String clean(String path) {
        String trimmed = path == null ? "" : path.strip();
        while (trimmed.startsWith("./")) {
            trimmed = trimmed.substring(2);
        }
        return trimmed.startsWith("/") ? trimmed.substring(1) : trimmed;
    }
}
