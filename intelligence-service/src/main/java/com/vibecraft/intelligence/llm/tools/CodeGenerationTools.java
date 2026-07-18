package com.vibecraft.intelligence.llm.tools;

import com.vibecraft.intelligence.service.ProjectFileReader;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;

import java.util.ArrayList;
import java.util.List;

@Slf4j
public class CodeGenerationTools {

    private final ProjectFileReader projectFileReader;
    private final Long projectId;
    /** Told each time the model reads files - ExplainLLM uses it to drop the "I'll read..." line said just before. */
    private final Runnable onRead;

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

        List<String> result = new ArrayList<>();

        for(String path: paths) {
            String cleanPath = path.startsWith("/") ? path.substring(1) : path;

            log.info("Requested file: {}", cleanPath);

            try {
                String content = projectFileReader.getFileContent(projectId, cleanPath).content();

                result.add(String.format(
                        "--- START OF FILE: %s ---\n%s\n--- END OF FILE ---",
                        cleanPath, content
                ));
            } catch (Exception e) {
                log.warn("Could not read requested file {}: {}", cleanPath, e.getMessage());
                result.add(String.format(
                        "--- FILE NOT FOUND: %s --- (this file does not exist yet in this project)",
                        cleanPath
                ));
            }
        }

        return result;
    }
}
