package com.vibecraft.workspace;

import com.vibecraft.common.util.WindowsTimezoneWorkaround;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;

/**
 * workspace-service's entry point: projects, members, project files and the live-preview pipeline.
 *
 * <p>Handles: starting the Spring context, applying the Windows timezone workaround first, and enabling Feign clients
 * over both this service's own clients and common-lib's shared account-service client.
 *
 * <p>The timezone workaround is a JVM default set in main(), so every service has to call it itself - PostgreSQL's
 * driver rejects the Asia/Calcutta alias a Windows JVM reports and fails Hibernate's first connection at boot.
 */
@SpringBootApplication
@EnableFeignClients(basePackages = {"com.vibecraft.workspace.feign", "com.vibecraft.common.feign"})
public class WorkspaceServiceApplication {

    public static void main(String[] args) {
        WindowsTimezoneWorkaround.apply();
        SpringApplication.run(WorkspaceServiceApplication.class, args);
    }
}
