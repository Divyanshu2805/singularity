package com.singularity.intelligence.service.impl;

import com.singularity.common.dto.FileContentDto;
import com.singularity.common.dto.FileTreeDto;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.llm.LlmResponseParser.ParsedEvent;
import com.singularity.intelligence.service.ProjectFileReader;
import feign.FeignException;
import feign.Request;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.MalformedInputException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Stream;

/**
 * A project held in memory, for running real build turns in a test without workspace-service.
 *
 * <p>Handles: starting as a copy of the starter template that ships in workspace-service, answering the file tree
 * and file reads a turn makes, taking a finished turn's files and deletes the way a published revision would, and
 * writing itself out to a folder so what a turn built can be looked at or compiled.
 *
 * <p>It reads the template off disk, from the sibling module, so a turn here starts from exactly what a new project
 * starts from - including after the template changes. A file that is not text is listed in the tree and never read,
 * which is how the real file API treats an image too.
 */
final class ScratchProject implements ProjectFileReader {

    static final String STARTER_TEMPLATES = "workspace-service/src/main/resources/starter-templates";

    private final Map<String, String> files = new TreeMap<>();

    static ScratchProject fromStarterTemplate() {
        Path templates = repositoryRoot().resolve(STARTER_TEMPLATES);
        try (Stream<Path> candidates = Files.list(templates)) {
            Path template = candidates.filter(Files::isDirectory).sorted().findFirst()
                    .orElseThrow(() -> new IllegalStateException("No starter template under " + templates));
            return fromFolder(template);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static ScratchProject fromFolder(Path folder) {
        ScratchProject project = new ScratchProject();
        try (Stream<Path> paths = Files.walk(folder)) {
            for (Path path : paths.filter(Files::isRegularFile).toList()) {
                String relative = folder.relativize(path).toString().replace('\\', '/');
                if (relative.equals("MANIFEST.txt") || relative.startsWith("node_modules/")) {
                    continue;
                }
                try {
                    project.files.put(relative, Files.readString(path, StandardCharsets.UTF_8).replace("\r\n", "\n"));
                } catch (MalformedInputException notText) {
                    project.files.put(relative, null);
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return project;
    }

    static Path repositoryRoot() {
        Path folder = Path.of("").toAbsolutePath();
        while (folder != null && !Files.isDirectory(folder.resolve(STARTER_TEMPLATES))) {
            folder = folder.getParent();
        }
        if (folder == null) {
            throw new IllegalStateException("Couldn't find the repository root from " + Path.of("").toAbsolutePath());
        }
        return folder;
    }

    ScratchProject copy() {
        ScratchProject copy = new ScratchProject();
        copy.files.putAll(files);
        return copy;
    }

    void apply(List<ParsedEvent> events) {
        for (ParsedEvent event : events) {
            if (event.type() == ChatEventType.FILE_EDIT) {
                files.put(event.path(), event.content());
            } else if (event.type() == ChatEventType.FILE_DELETE) {
                files.remove(event.path());
            }
        }
    }

    String content(String path) {
        return files.get(path);
    }

    boolean has(String path) {
        return files.containsKey(path);
    }

    void writeTo(Path folder) {
        try {
            for (Map.Entry<String, String> file : files.entrySet()) {
                if (file.getValue() == null) {
                    continue;
                }
                Path target = folder.resolve(file.getKey());
                Files.createDirectories(target.getParent());
                Files.writeString(target, file.getValue(), StandardCharsets.UTF_8);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Override
    public FileTreeDto getFileTree(Long projectId) {
        return new FileTreeDto(projectId, files.entrySet().stream()
                .map(file -> new FileTreeDto.Entry(file.getKey(),
                        file.getValue() == null ? 100_000 : file.getValue().length(), "text/plain"))
                .toList());
    }

    @Override
    public FileContentDto getFileContent(Long projectId, String path) {
        String content = files.get(path);
        if (content == null) {
            throw new FeignException.NotFound("No such file: " + path,
                    Request.create(Request.HttpMethod.GET, "/internal/v1/projects/" + projectId + "/files/content",
                            Map.of(), null, StandardCharsets.UTF_8, null),
                    null, Map.of());
        }
        return new FileContentDto(path, content);
    }
}
