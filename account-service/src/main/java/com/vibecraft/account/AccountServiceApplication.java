package com.vibecraft.account;

import com.vibecraft.common.util.WindowsTimezoneWorkaround;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * account-service's entry point: users, plans, subscriptions, Stripe billing and the auth audit trail.
 *
 * <p>Handles: starting the Spring context, and applying the Windows timezone workaround first. That workaround is a
 * JVM default set in main(), so every service has to call it itself - PostgreSQL's driver rejects the Asia/Calcutta
 * alias a Windows JVM reports and fails Hibernate's first connection at boot.
 */
@SpringBootApplication
public class AccountServiceApplication {

    public static void main(String[] args) {
        WindowsTimezoneWorkaround.apply();
        SpringApplication.run(AccountServiceApplication.class, args);
    }
}
