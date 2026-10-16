package com.singularity.account.service.impl;

import com.singularity.account.service.DemoAccountService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * When the shared demo account is made and put back: once a day, and soon after start-up while it does not exist.
 *
 * <p>Handles: the daily reset ({@code demo.reset-cron}, 03:30 in India by default, when nobody is likely to be using
 * it), making the account on the first start of a deployment that has none, and trying again every few minutes after
 * a run that failed - most often because another service was not up yet.
 *
 * <p>A start-up never resets an account that already exists: a deploy restarts account-service, and a visitor in the
 * middle of looking around should not lose their work to it. Only {@code demo.enabled} brings this into being.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "demo.enabled", havingValue = "true")
public class DemoAccountReset {

    private final DemoAccountService demoAccountService;

    private volatile Boolean due;

    @Scheduled(cron = "${demo.reset-cron:0 0 22 * * *}", zone = "UTC")
    public void daily() {
        run();
    }

    @Scheduled(fixedDelayString = "${demo.retry-interval:10m}", initialDelayString = "${demo.initial-delay:2m}")
    public void whenDue() {
        try {
            if (due == null) {
                due = !demoAccountService.exists();
            }
        } catch (RuntimeException e) {
            log.warn("Couldn't tell whether the demo account exists yet", e);
            return;
        }
        if (due) {
            run();
        }
    }

    void run() {
        try {
            demoAccountService.reset();
            due = false;
        } catch (RuntimeException e) {
            due = true;
            log.error("Couldn't put the demo account back; trying again shortly", e);
        }
    }
}
