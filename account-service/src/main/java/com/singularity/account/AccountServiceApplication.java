package com.singularity.account;

import com.singularity.common.util.WindowsTimezoneWorkaround;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;

/**
 * account-service's entry point: users, plans, subscriptions, Stripe billing and the auth audit trail.
 *
 * <p>Handles: starting the Spring context, enabling the Feign clients account deletion calls the other services with, and applying the Windows timezone workaround first. That workaround is a
 * JVM default set in main(), so every service has to call it itself - PostgreSQL's driver rejects the Asia/Calcutta
 * alias a Windows JVM reports and fails Hibernate's first connection at boot.
 */
@SpringBootApplication
@EnableFeignClients(basePackages = "com.singularity.account.feign")
public class AccountServiceApplication {

    public static void main(String[] args) {
        WindowsTimezoneWorkaround.apply();
        SpringApplication.run(AccountServiceApplication.class, args);
    }
}
