package com.singularity.workspace.util;

import com.singularity.common.error.BadRequestException;
import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Packs a project's files into a tar for a runner pod, and reads a build's tar back out.
 *
 * <p>Handles: writing a path-to-bytes map as one archive (so a project goes into a pod in one transfer, not one per
 * file), and reading an archive a pod produced into a path-to-bytes map under hard limits: how many files, how many
 * bytes in all, how many in any one file.
 *
 * <p>Reading is the dangerous direction, because the archive was made by a pod running a project's own code. Only
 * regular files are taken: a directory is skipped, and a symbolic link, a hard link or a device is ignored rather than
 * followed, so a build cannot place a link to something else in the pod in front of the reader. Every path goes through
 * {@link ProjectFilePath} after a leading "./" is dropped, so nothing with {@code ..}, an absolute path, a backslash or
 * a control character comes out. A limit passed is an error, never a truncation: a half-read build would be published
 * as if it were whole.
 */
public final class TarArchive {

    public record Limits(int maxFiles, long maxTotalBytes, long maxFileBytes) {
    }

    private TarArchive() {
    }

    public static byte[] pack(Map<String, byte[]> files) {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (TarArchiveOutputStream tar = new TarArchiveOutputStream(bytes)) {
            tar.setLongFileMode(TarArchiveOutputStream.LONGFILE_POSIX);
            tar.setBigNumberMode(TarArchiveOutputStream.BIGNUMBER_POSIX);
            for (Map.Entry<String, byte[]> file : files.entrySet()) {
                TarArchiveEntry entry = new TarArchiveEntry(ProjectFilePath.normalize(file.getKey()));
                entry.setSize(file.getValue().length);
                entry.setModTime(0L);
                entry.setMode(0644);
                tar.putArchiveEntry(entry);
                tar.write(file.getValue());
                tar.closeArchiveEntry();
            }
            tar.finish();
        } catch (IOException e) {
            throw new IllegalStateException("Couldn't write the project's files into an archive", e);
        }
        return bytes.toByteArray();
    }

    public static Map<String, byte[]> unpack(byte[] archive, Limits limits) {
        Map<String, byte[]> files = new LinkedHashMap<>();
        long total = 0;
        try (TarArchiveInputStream tar = new TarArchiveInputStream(new ByteArrayInputStream(archive))) {
            TarArchiveEntry entry;
            while ((entry = tar.getNextEntry()) != null) {
                if (!entry.isFile() || entry.isLink() || entry.isSymbolicLink() || entry.isCharacterDevice()
                        || entry.isBlockDevice() || entry.isFIFO()) {
                    continue;
                }
                String name = entry.getName();
                while (name.startsWith("./")) {
                    name = name.substring(2);
                }
                if (name.isEmpty()) {
                    continue;
                }
                String path = ProjectFilePath.normalize(name);
                if (entry.getSize() > limits.maxFileBytes()) {
                    throw new TooLargeException("The file " + path + " is larger than a published file may be.");
                }
                if (files.size() + 1 > limits.maxFiles()) {
                    throw new TooLargeException("The build has more than " + limits.maxFiles() + " files.");
                }
                total += entry.getSize();
                if (total > limits.maxTotalBytes()) {
                    throw new TooLargeException("The build is larger than " + (limits.maxTotalBytes() / (1024 * 1024)) + " MB.");
                }
                byte[] content = tar.readNBytes((int) entry.getSize());
                if (content.length != entry.getSize()) {
                    throw new IOException("The archive ended inside " + path);
                }
                files.put(path, content);
            }
        } catch (IOException e) {
            throw new BadRequestException("The build's files couldn't be read back: " + e.getMessage());
        }
        return files;
    }

    /** A limit was passed; carries the sentence the person is shown. */
    public static final class TooLargeException extends BadRequestException {
        public TooLargeException(String message) {
            super(message);
        }
    }
}
