package com.java.vibecraft.service.impl;

import com.java.vibecraft.config.PreviewProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

/** The small pure pieces of live previews: reading the pod probe, building URLs, trimming saved logs. */
class PreviewPlumbingTest {

    @Test
    @DisplayName("probe: nothing written yet means still installing, not failed")
    void probeStillInstalling() {
        var probe = PreviewBootstrapper.Probe.parse("||down\n");
        assertThat(probe.installExit()).isNull();
        assertThat(probe.devExit()).isNull();
        assertThat(probe.serving()).isFalse();
    }

    @Test
    @DisplayName("probe: a failed install and a serving dev server are told apart by exit codes, not output")
    void probeOutcomes() {
        assertThat(PreviewBootstrapper.Probe.parse("1||down").installExit()).isEqualTo(1);
        var serving = PreviewBootstrapper.Probe.parse("0||up");
        assertThat(serving.installExit()).isZero();
        assertThat(serving.serving()).isTrue();
        assertThat(PreviewBootstrapper.Probe.parse("0|1|down").devExit()).isEqualTo(1);
    }

    @Test
    @DisplayName("probe: stray output before the status line (a shell warning) is ignored")
    void probeReadsLastLine() {
        assertThat(PreviewBootstrapper.Probe.parse("sh: warning\n0||up").serving()).isTrue();
        assertThat(PreviewBootstrapper.Probe.parse("garbage").serving()).isFalse();
        assertThat(PreviewBootstrapper.Probe.parse(null).serving()).isFalse();
    }

    @Test
    @DisplayName("URL: the port is shown in dev and left out when it's the scheme's default")
    void urls() {
        assertThat(properties("http", "localhost", 8090).urlFor("p1-abc.localhost"))
                .isEqualTo("http://p1-abc.localhost:8090/");
        assertThat(properties("https", "preview.example.com", 443).urlFor("p1-abc.preview.example.com"))
                .isEqualTo("https://p1-abc.preview.example.com/");
        assertThat(properties("http", "localhost", null).urlFor("p1-abc.localhost"))
                .isEqualTo("http://p1-abc.localhost/");
    }

    @Test
    @DisplayName("saved failure logs keep the end, where npm prints the actual error")
    void failureLogKeepsTheTail() {
        String log = "x".repeat(PreviewLifecycle.MAX_FAILURE_LOG_CHARS) + "npm ERR! the real problem";
        String kept = PreviewLifecycle.tail(log);
        assertThat(kept).endsWith("npm ERR! the real problem").startsWith("...");
        assertThat(kept).hasSize(PreviewLifecycle.MAX_FAILURE_LOG_CHARS + 3);
        assertThat(PreviewLifecycle.tail("   ")).isNull();
    }

    private static PreviewProperties properties(String scheme, String domain, Integer port) {
        return new PreviewProperties("ns", scheme, domain, port, 5173, "myminio", "projects",
                Duration.ofMinutes(30), Duration.ofMinutes(6), Duration.ofHours(2));
    }
}
