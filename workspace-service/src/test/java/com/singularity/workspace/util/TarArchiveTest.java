package com.singularity.workspace.util;

import com.singularity.common.error.BadRequestException;
import com.singularity.workspace.util.TarArchive.Limits;
import com.singularity.workspace.util.TarArchive.TooLargeException;
import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The tar a project goes into a build pod as, and - the dangerous direction - the tar a build comes back in. The
 * archive was made by a pod running a project's own code, so these cases are the ones that code could use against the
 * service: links, traversing names, oversized files and a build that adds up to too much.
 */
class TarArchiveTest {

    private static final Limits ROOMY = new Limits(100, 10_000_000, 10_000_000);

    private static byte[] text(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }

    private interface Writer {
        void write(TarArchiveOutputStream tar) throws IOException;
    }

    private static byte[] tarOf(Writer writer) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (TarArchiveOutputStream tar = new TarArchiveOutputStream(bytes)) {
            tar.setLongFileMode(TarArchiveOutputStream.LONGFILE_POSIX);
            writer.write(tar);
            tar.finish();
        }
        return bytes.toByteArray();
    }

    private static void file(TarArchiveOutputStream tar, String name, String content) throws IOException {
        byte[] bytes = text(content);
        TarArchiveEntry entry = new TarArchiveEntry(name);
        entry.setSize(bytes.length);
        tar.putArchiveEntry(entry);
        tar.write(bytes);
        tar.closeArchiveEntry();
    }

    @Test
    @DisplayName("a project survives a round trip through the archive, binary content included")
    void roundTrip() {
        Map<String, byte[]> files = new LinkedHashMap<>();
        files.put("package.json", text("{\"name\":\"x\"}"));
        files.put("src/App.tsx", text("export default 1;"));
        files.put("public/logo.png", new byte[]{(byte) 0x89, 'P', 'N', 'G', 0, 1, 2, (byte) 0xff});

        Map<String, byte[]> back = TarArchive.unpack(TarArchive.pack(files), ROOMY);

        assertThat(back.keySet()).containsExactlyElementsOf(files.keySet());
        files.forEach((path, bytes) -> assertThat(back.get(path)).isEqualTo(bytes));
    }

    @Test
    @DisplayName("a leading ./ on every entry - the way tar writes a directory - is dropped")
    void dropsTheLeadingDot() throws IOException {
        byte[] tar = tarOf(t -> {
            file(t, "./index.html", "<html></html>");
            file(t, "./assets/app.js", "console.log(1)");
        });

        assertThat(TarArchive.unpack(tar, ROOMY).keySet()).containsExactly("index.html", "assets/app.js");
    }

    @Test
    @DisplayName("directories and the archive's own root entry are skipped, not turned into files")
    void skipsDirectories() throws IOException {
        byte[] tar = tarOf(t -> {
            t.putArchiveEntry(new TarArchiveEntry("./"));
            t.closeArchiveEntry();
            t.putArchiveEntry(new TarArchiveEntry("./assets/"));
            t.closeArchiveEntry();
            file(t, "./assets/app.js", "x");
        });

        assertThat(TarArchive.unpack(tar, ROOMY).keySet()).containsExactly("assets/app.js");
    }

    @Test
    @DisplayName("a symbolic link is ignored, never followed, so a build cannot plant a link to the pod's own files")
    void ignoresSymbolicLinks() throws IOException {
        byte[] tar = tarOf(t -> {
            file(t, "./index.html", "<html></html>");
            TarArchiveEntry link = new TarArchiveEntry("./secret", TarArchiveEntry.LF_SYMLINK);
            link.setLinkName("/etc/passwd");
            t.putArchiveEntry(link);
            t.closeArchiveEntry();
        });

        assertThat(TarArchive.unpack(tar, ROOMY).keySet()).containsExactly("index.html");
    }

    @Test
    @DisplayName("a hard link is ignored too")
    void ignoresHardLinks() throws IOException {
        byte[] tar = tarOf(t -> {
            file(t, "./index.html", "<html></html>");
            TarArchiveEntry link = new TarArchiveEntry("./copy", TarArchiveEntry.LF_LINK);
            link.setLinkName("index.html");
            t.putArchiveEntry(link);
            t.closeArchiveEntry();
        });

        assertThat(TarArchive.unpack(tar, ROOMY).keySet()).containsExactly("index.html");
    }

    @Test
    @DisplayName("a name that climbs out of the folder is refused, not written anywhere")
    void refusesTraversal() throws IOException {
        byte[] tar = tarOf(t -> file(t, "./../../etc/cron.d/evil", "x"));

        assertThatThrownBy(() -> TarArchive.unpack(tar, ROOMY)).isInstanceOf(BadRequestException.class);
    }

    @Test
    @DisplayName("an absolute name is read as relative to the folder, never as a path of its own")
    void absoluteNamesAreRelative() throws IOException {
        byte[] tar = tarOf(t -> file(t, "/etc/passwd", "x"));

        assertThat(TarArchive.unpack(tar, ROOMY).keySet()).containsExactly("etc/passwd");
    }

    @Test
    @DisplayName("a name with a control character is refused")
    void refusesOddNames() throws IOException {
        assertThatThrownBy(() -> TarArchive.unpack(tarOf(t -> file(t, "a\u0007b.js", "x")), ROOMY))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    @DisplayName("more files than the limit is an error, not a truncated build")
    void refusesTooManyFiles() throws IOException {
        byte[] tar = tarOf(t -> {
            file(t, "a.js", "1");
            file(t, "b.js", "2");
            file(t, "c.js", "3");
        });

        assertThatThrownBy(() -> TarArchive.unpack(tar, new Limits(2, 1000, 1000)))
                .isInstanceOf(TooLargeException.class).hasMessageContaining("more than 2 files");
    }

    @Test
    @DisplayName("a build that adds up to more than the limit is an error")
    void refusesTooManyBytes() throws IOException {
        byte[] tar = tarOf(t -> {
            file(t, "a.js", "x".repeat(600));
            file(t, "b.js", "x".repeat(600));
        });

        assertThatThrownBy(() -> TarArchive.unpack(tar, new Limits(10, 1000, 1000)))
                .isInstanceOf(TooLargeException.class);
    }

    @Test
    @DisplayName("one file over the per-file limit is an error that names it")
    void refusesOneHugeFile() throws IOException {
        byte[] tar = tarOf(t -> file(t, "big.bin", "x".repeat(2000)));

        assertThatThrownBy(() -> TarArchive.unpack(tar, new Limits(10, 100_000, 1000)))
                .isInstanceOf(TooLargeException.class).hasMessageContaining("big.bin");
    }

    @Test
    @DisplayName("garbage that is not an archive is an error, not an empty build")
    void garbageIsRefused() {
        byte[] garbage = new byte[2000];
        java.util.Arrays.fill(garbage, (byte) 'x');

        assertThatThrownBy(() -> TarArchive.unpack(garbage, ROOMY)).isInstanceOf(BadRequestException.class);
    }

    @Test
    @DisplayName("an empty archive is an empty build")
    void emptyArchive() {
        assertThat(TarArchive.unpack(TarArchive.pack(Map.of()), ROOMY)).isEmpty();
    }

    @Test
    @DisplayName("packing refuses a path that is not a plain relative one")
    void packingValidatesPaths() {
        assertThatThrownBy(() -> TarArchive.pack(Map.of("../escape.txt", text("x")))).isInstanceOf(BadRequestException.class);
    }

    @Test
    @DisplayName("a long path survives the round trip")
    void longPaths() {
        String path = "src/" + "very-long-folder-name/".repeat(8) + "File.tsx";

        Map<String, byte[]> back = TarArchive.unpack(TarArchive.pack(Map.of(path, text("x"))), ROOMY);

        assertThat(back.keySet()).containsExactly(path);
    }
}
