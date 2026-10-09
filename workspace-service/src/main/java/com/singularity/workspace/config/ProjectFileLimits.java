package com.singularity.workspace.config;

import com.singularity.common.dto.FileChangeDto;
import com.singularity.workspace.entity.ProjectFile;
import com.singularity.workspace.util.ProjectFilePath;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * How large one project may grow: how many files, how big one file, how big all of them together.
 *
 * <p>Handles: holding the three limits, and saying in one plain sentence why a set of changes would take a project
 * past one of them - or nothing when it would not.
 *
 * <p>Nothing bounded a project before. Every file a model writes is copied into storage, into each preview pod that
 * opens the project, into every ZIP and into the model's own prompt, so one project told to "write 5,000 files" - by
 * its owner, or by text planted in a file of a forked project - cost storage, pod disk and tokens without limit. The
 * check runs where every write to a project lands, the revision publisher, before anything is stored.
 *
 * <p>A change is refused only when it leaves the project both over a limit and larger than it was. A project that is
 * already over - created before the limits, or after they were lowered - can still be edited and can always be made
 * smaller; it just cannot grow. One file over the per-file limit is always refused.
 *
 * <p>The sentence is written for the person at the chat, because it is shown to them as it is.
 */
@ConfigurationProperties(prefix = "project-files")
public record ProjectFileLimits(int maxFiles, long maxFileBytes, long maxProjectBytes) {

    public Optional<String> exceededBy(List<ProjectFile> current, List<FileChangeDto> changes) {
        Map<String, Long> sizes = new HashMap<>();
        for (ProjectFile file : current) {
            sizes.put(file.getPath(), file.getSize() == null ? 0L : file.getSize());
        }
        int filesBefore = sizes.size();
        long bytesBefore = total(sizes);

        for (FileChangeDto change : changes) {
            String path = ProjectFilePath.normalize(change.path());
            if (change.changeType() == FileChangeDto.ChangeType.DELETE) {
                sizes.remove(path);
                continue;
            }
            long bytes = change.content() == null ? 0L : change.content().getBytes(StandardCharsets.UTF_8).length;
            if (bytes > maxFileBytes) {
                return Optional.of("Nothing was saved: " + path + " would be " + readable(bytes)
                        + ", and one file can be at most " + readable(maxFileBytes) + ".");
            }
            sizes.put(path, bytes);
        }

        if (sizes.size() > maxFiles && sizes.size() > filesBefore) {
            return Optional.of("Nothing was saved: this change would bring the project to " + sizes.size()
                    + " files, and a project can hold at most " + maxFiles + ". Remove some files first.");
        }
        long bytesAfter = total(sizes);
        if (bytesAfter > maxProjectBytes && bytesAfter > bytesBefore) {
            return Optional.of("Nothing was saved: this change would bring the project to " + readable(bytesAfter)
                    + ", and a project can hold at most " + readable(maxProjectBytes) + ". Remove some files first.");
        }
        return Optional.empty();
    }

    private static long total(Map<String, Long> sizes) {
        return sizes.values().stream().mapToLong(Long::longValue).sum();
    }

    static String readable(long bytes) {
        if (bytes >= 1024 * 1024) {
            return String.format(java.util.Locale.ROOT, "%.1f MB", bytes / (1024.0 * 1024.0));
        }
        return Math.max(1, Math.round(bytes / 1024.0)) + " KB";
    }
}
