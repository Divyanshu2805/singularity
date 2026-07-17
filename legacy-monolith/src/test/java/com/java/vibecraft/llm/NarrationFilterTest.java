package com.java.vibecraft.llm;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class NarrationFilterTest {

    private static String shown(NarrationFilter filter, List<String> out) {
        out.addAll(filter.finish());
        return String.join("", out);
    }

    @Test
    void dropsTheAnnouncementBeforeAFileReadAndKeepsTheAnswer() {
        NarrationFilter filter = new NarrationFilter();
        List<String> out = new ArrayList<>();

        out.addAll(filter.accept("I'll read the surrounding code so the explanation "));
        out.addAll(filter.accept("matches what's actually there."));
        filter.toolInvoked();
        out.addAll(filter.accept("This is the **page header** on the notes list."));

        assertThat(shown(filter, out)).isEqualTo("This is the **page header** on the notes list.");
    }

    @Test
    void anAnswerThatNeverReadsAnythingIsKeptWhole() {
        NarrationFilter filter = new NarrationFilter();
        List<String> out = new ArrayList<>();

        out.addAll(filter.accept("A short answer."));

        assertThat(out).isEmpty(); // held until the stream ends
        assertThat(shown(filter, out)).isEqualTo("A short answer.");
    }

    @Test
    void releasesOnceTheAnswerIsClearlyUnderwayAndThenStreamsLive() {
        NarrationFilter filter = new NarrationFilter();
        String opening = "x".repeat(NarrationFilter.HOLD_CHARS);

        assertThat(filter.accept(opening)).containsExactly(opening);
        assertThat(filter.accept(" more")).containsExactly(" more");
    }

    @Test
    void holdsTheStartOfEachRoundSoASecondAnnouncementIsDroppedToo() {
        NarrationFilter filter = new NarrationFilter();
        List<String> out = new ArrayList<>();

        out.addAll(filter.accept("Let me look at the page first."));
        filter.toolInvoked();
        out.addAll(filter.accept("Now the hook it uses."));
        filter.toolInvoked();
        out.addAll(filter.accept("The page reads notes from `useNotes`."));

        assertThat(shown(filter, out)).isEqualTo("The page reads notes from `useNotes`.");
    }
}
