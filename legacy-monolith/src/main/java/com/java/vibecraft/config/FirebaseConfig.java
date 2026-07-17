package com.java.vibecraft.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

@Configuration
public class FirebaseConfig {

    /** Named rather than Firebase's DEFAULT app, so a context restart in the same JVM reuses it instead of throwing. */
    private static final String APP_NAME = "vibecraft";

    @Bean
    public FirebaseApp firebaseApp(@Value("${firebase.project-id}") String projectId,
                                   @Value("${firebase.credentials-path}") String credentialsPath) throws IOException {
        for (FirebaseApp app : FirebaseApp.getApps()) {
            if (app.getName().equals(APP_NAME)) return app;
        }
        try (InputStream in = Files.newInputStream(Path.of(credentialsPath))) {
            FirebaseOptions options = FirebaseOptions.builder()
                    .setCredentials(GoogleCredentials.fromStream(in))
                    .setProjectId(projectId)
                    .build();
            return FirebaseApp.initializeApp(options, APP_NAME);
        }
    }

    @Bean
    public FirebaseAuth firebaseAuth(FirebaseApp firebaseApp) {
        return FirebaseAuth.getInstance(firebaseApp);
    }
}
