package com.vibecraft.common.util;

import java.util.TimeZone;

/**
 * A Windows JVM reports the legacy {@code Asia/Calcutta} timezone alias; PostgreSQL's JDBC driver rejects
 * it outright ("invalid value for parameter TimeZone"), which fails Hibernate's very first connection at
 * boot. Call {@link #apply()} as the first line of {@code main()} — not in a {@code @PostConstruct} or bean
 * initializer, since the JDBC connection pool can be created before Spring gets that far, and Spring Boot
 * test infrastructure calls {@code SpringApplication.run(...)} directly, bypassing {@code main()} entirely,
 * which is why this doesn't help a bare {@code ./mvnw test} — see docs/local-development/.
 */
public final class WindowsTimezoneWorkaround {

    private WindowsTimezoneWorkaround() {
    }

    public static void apply() {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
    }
}
