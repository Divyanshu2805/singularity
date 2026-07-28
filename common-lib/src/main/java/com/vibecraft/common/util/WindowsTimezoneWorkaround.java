package com.vibecraft.common.util;

import java.util.TimeZone;

/**
 * Makes a Windows JVM's timezone acceptable to PostgreSQL before anything connects.
 *
 * <p>Handles: replacing the JVM default, which Windows reports as the old Asia/Calcutta alias, with Asia/Kolkata. The
 * PostgreSQL JDBC driver rejects the alias outright and fails Hibernate's very first connection at boot.
 *
 * <p>Call this as the first line of main(), not from a @PostConstruct or bean initializer: the connection pool can be
 * created before Spring gets that far. It is a JVM default set in main(), so every service has to call it itself -
 * one service's fix does not help another. It also does not help a bare test run, which never goes through main().
 */
public final class WindowsTimezoneWorkaround {

    private WindowsTimezoneWorkaround() {
    }

    public static void apply() {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
    }
}
