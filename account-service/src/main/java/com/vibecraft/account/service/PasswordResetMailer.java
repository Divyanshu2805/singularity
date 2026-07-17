package com.vibecraft.account.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * Sends the reset email off the request thread. That's for privacy as much as speed: if the SMTP round trip ran
 * inline, "forgot password" would answer measurably slower for an email that has an account than for one that
 * doesn't - exactly the probe its identical response exists to prevent.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PasswordResetMailer {

    private final JavaMailSender mailSender;

    @Value("${password-reset.mail-from}")
    private String from;

    @Value("${client.url}")
    private String clientUrl;

    @Async
    public void sendResetLink(String to, String name, String token, Duration validity) {
        String greeting = name == null || name.isBlank() ? "there" : name;
        String link = clientUrl + "/reset-password?token=" + token;

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(to);
        message.setSubject("Reset your VibeCraft password");
        message.setText("Hi " + greeting + ",\n\n"
                + "Someone (hopefully you) asked to reset the password for your VibeCraft account. "
                + "Choose a new one here:\n\n"
                + link + "\n\n"
                + "This link works once and expires in " + validity.toMinutes() + " minutes. "
                + "If you didn't ask for this, you can ignore this email and your password won't change.\n\n"
                + "- VibeCraft\n");

        try {
            mailSender.send(message);
        } catch (MailException ex) {
            log.error("Couldn't send the password reset email", ex);
        }
    }
}
