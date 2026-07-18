package com.vibecraft.workspace.util;

import java.net.URLConnection;

public class ContentTypeUtils {

    private ContentTypeUtils() {
    }

    public static String determineContentType(String path) {
        // Checked before guessContentTypeFromName: the JDK's built-in MIME table maps ".ts" to
        // "video/mp2t"-style MPEG Transport Stream types, which wrongly wins for TypeScript files.
        if (path.endsWith(".jsx") || path.endsWith(".ts") || path.endsWith(".tsx")) return "text/javascript";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".css")) return "text/css";

        String type = URLConnection.guessContentTypeFromName(path);
        if (type != null) return type;

        return "text/plain";
    }
}
