package com.vibecraft.workspace.util;

import java.net.URLConnection;

/**
 * Decides a file's content type from its path.
 *
 * <p>Handles: the web extensions explicitly, then the JDK's own table, then plain text as a fallback.
 *
 * <p>The explicit cases come first because the JDK's MIME table maps .ts to an MPEG transport-stream type, which
 * would otherwise win for TypeScript files and make them look like binaries to everything downstream.
 */
public class ContentTypeUtils {

    private ContentTypeUtils() {
    }

    public static String determineContentType(String path) {
        if (path.endsWith(".jsx") || path.endsWith(".ts") || path.endsWith(".tsx")) return "text/javascript";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".css")) return "text/css";

        String type = URLConnection.guessContentTypeFromName(path);
        if (type != null) return type;

        return "text/plain";
    }
}
