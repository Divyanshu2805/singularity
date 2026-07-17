package com.java.vibecraft.service.impl;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The CSV export's one piece of user-controlled text: project names. */
class UsageInsightsServiceImplTest {

    @Test
    @DisplayName("quotes project names and doubles their quotes")
    void quotesCells() {
        assertThat(UsageInsightsServiceImpl.csvCell("My \"shop\", v2")).isEqualTo("\"My \"\"shop\"\", v2\"");
    }

    @Test
    @DisplayName("neutralises a name that a spreadsheet would run as a formula")
    void neutralisesFormulas() {
        assertThat(UsageInsightsServiceImpl.csvCell("=HYPERLINK(\"x\")")).startsWith("\"'=");
        assertThat(UsageInsightsServiceImpl.csvCell("+1")).isEqualTo("\"'+1\"");
        assertThat(UsageInsightsServiceImpl.csvCell("-2")).isEqualTo("\"'-2\"");
        assertThat(UsageInsightsServiceImpl.csvCell("@cmd")).isEqualTo("\"'@cmd\"");
    }

    @Test
    @DisplayName("writes an empty cell for a call with no project")
    void emptyCell() {
        assertThat(UsageInsightsServiceImpl.csvCell(null)).isEqualTo("\"\"");
    }
}
