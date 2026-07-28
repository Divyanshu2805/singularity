package com.vibecraft.common.config;

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

/**
 * The Firebase Admin SDK handle every service authenticates session cookies with.
 *
 * <p>Handles: loading the service-account credentials from firebase.credentials-path and exposing the resulting
 * FirebaseAuth. Each service initialises its own named app rather than Firebase's DEFAULT one, named after
 * spring.application.name, so a context restart in the same JVM reuses the existing app instead of throwing and two
 * services sharing a JVM never collide.
 */
@Configuration
public class FirebaseConfig {

    @Bean
    public FirebaseApp firebaseApp(@Value("${spring.application.name}") String applicationName,
                                   @Value("${firebase.project-id}") String projectId,
                                   @Value("${firebase.credentials-path}") String credentialsPath) throws IOException {
        String appName = "vibecraft-" + applicationName;
        for (FirebaseApp app : FirebaseApp.getApps()) {
            if (app.getName().equals(appName)) return app;
        }
        try (InputStream in = Files.newInputStream(Path.of(credentialsPath))) {
            FirebaseOptions options = FirebaseOptions.builder()
                    .setCredentials(GoogleCredentials.fromStream(in))
                    .setProjectId(projectId)
                    .build();
            return FirebaseApp.initializeApp(options, appName);
        }
    }

    @Bean
    public FirebaseAuth firebaseAuth(FirebaseApp firebaseApp) {
        return FirebaseAuth.getInstance(firebaseApp);
    }
}
