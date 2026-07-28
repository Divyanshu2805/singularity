package com.vibecraft.intelligence;

import com.vibecraft.common.util.WindowsTimezoneWorkaround;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;

/**
 * intelligence-service's entry point: AI generation, code insight, the idea interview and usage metering.
 *
 * <p>Handles: starting the Spring context, applying the Windows timezone workaround first, and enabling Feign clients
 * over both this service's own clients and common-lib's shared account-service client.
 *
 * <p>The timezone workaround is a JVM default set in main(), so every service has to call it itself - PostgreSQL's
 * driver rejects the Asia/Calcutta alias a Windows JVM reports and fails Hibernate's first connection at boot.
 */
@SpringBootApplication
@EnableFeignClients(basePackages = {"com.vibecraft.intelligence.feign", "com.vibecraft.common.feign"})
public class IntelligenceServiceApplication {

    public static void main(String[] args) {
        WindowsTimezoneWorkaround.apply();
        SpringApplication.run(IntelligenceServiceApplication.class, args);
    }
}
