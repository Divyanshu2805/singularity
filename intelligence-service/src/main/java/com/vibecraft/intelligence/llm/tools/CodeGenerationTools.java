package com.vibecraft.intelligence.llm.tools;

import com.vibecraft.intelligence.service.ProjectFileReader;
import feign.FeignException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The one tool the model is given: reading files it can see in the file tree.
 *
 * <p>Handles: resolving each requested path, returning its content wrapped in markers the model can read, bounding
 * how many files one call may ask for, and notifying the caller that a read happened - which is how the code lens
 * knows to drop the line the model said just before it.
 *
 * <p>A file that genuinely does not exist and a file that could not be read are reported differently on purpose.
 * Telling the model a file is absent when it is merely unreadable makes it recreate the file, losing whatever was in
 * it.
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
 * turn that is not converging fails fast instead of quietly burning the daily budget. Both counters are per-instance,
 * and a fresh instance is built per generation call ({@code AiGenerationServiceImpl}), so neither leaks across turns.
 */
@Slf4j
public class CodeGenerationTools {

    static final int MAX_FILES_PER_CALL = 25;
    static final int MAX_CALLS = 6;

    private final ProjectFileReader projectFileReader;
    private final Long projectId;
    private final Runnable onRead;
    private final Set<String> alreadyReadInFull = new HashSet<>();
    private final AtomicInteger callCount = new AtomicInteger(0);

    public CodeGenerationTools(ProjectFileReader projectFileReader, Long projectId) {
        this(projectFileReader, projectId, () -> { });
    }

    public CodeGenerationTools(ProjectFileReader projectFileReader, Long projectId, Runnable onRead) {
        this.projectFileReader = projectFileReader;
        this.projectId = projectId;
        this.onRead = onRead;
    }

    @Tool(name = "read_files",
            description = "Read the content of files. Only input the file names present inside the FILE_TREE. DO NOT input any path which is not present under the FILE_TREE.")
    public List<String> readFiles(
            @ToolParam(description = "List of relative paths (e.g., ['src/App.tsx'])")
            List<String> paths
    ) {
        onRead.run();
        if (paths == null || paths.isEmpty()) {
            log.warn("read_files called with no paths");
            return List.of();
        }
        if (paths.size() > MAX_FILES_PER_CALL) {
            log.warn("read_files asked for {} files; reading the first {}", paths.size(), MAX_FILES_PER_CALL);
            paths = paths.subList(0, MAX_FILES_PER_CALL);
        }

        if (callCount.incrementAndGet() > MAX_CALLS) {
            log.warn("read_files call {} for projectId {} exceeds the per-turn cap of {} - refusing further reads",
                    callCount.get(), projectId, MAX_CALLS);
            return paths.stream()
                    .map(path -> String.format(
                            "--- READ LIMIT REACHED: %s --- (you've made too many file-read calls this turn; stop "
                                    + "reading and write your answer with what you already have above - if "
                                    + "something is still unclear, say so instead of reading more)",
                            path))
                    .toList();
        }

        List<String> result = new ArrayList<>();

        for(String path: paths) {
            String cleanPath = path.startsWith("/") ? path.substring(1) : path;

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

                result.add(String.format(
                        "--- START OF FILE: %s ---\n%s\n--- END OF FILE ---",
                        cleanPath, content
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

        return result;
    }
}
