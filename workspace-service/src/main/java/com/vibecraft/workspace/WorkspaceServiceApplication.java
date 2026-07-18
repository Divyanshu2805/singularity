package com.vibecraft.workspace;

import com.vibecraft.common.util.WindowsTimezoneWorkaround;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;

// @EnableFeignClients is new to this module - workspace-service is the first service in this codebase to
// actually call another one via Feign (account-service, for plan limits and user lookups). See
// com.vibecraft.workspace.feign.AccountServiceClient.
@SpringBootApplication
@EnableFeignClients
public class WorkspaceServiceApplication {

    public static void main(String[] args) {
        WindowsTimezoneWorkaround.apply();
        SpringApplication.run(WorkspaceServiceApplication.class, args);
    }
}
