package com.vibecraft.workspace.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * CODE_REVIEW.md AI-09's build/typecheck validation: whether it runs at all, what command proves a staged revision
 * is sound, and the bounds around a check that runs real, untrusted, AI-generated code.
 *
 * <p>{@code enabled} defaults to {@code false} - a cold validation cycle (claim a pod, {@code npm install}, run
 * the check, delete the pod) is a genuinely large, unmeasured latency and cluster-load cost on every single AI
 * generation turn; this ships the mechanism without turning it on until real numbers justify it. {@code command}
 * defaults to {@code npx tsc --noEmit}, not {@code npm run build} - confirmed live against the actual starter
 * template (`react-vite-tailwind-daisyui-starter`'s `package.json`/`tsconfig.json`): its `build` script is a plain
 * `vite build`, which strips TypeScript types without checking them, so it would miss most of the type errors an
 * AI model is likely to introduce; `tsc --noEmit` both catches that error class and skips bundling, so it is also
 * faster.
 */
@ConfigurationProperties(prefix = "revision-validation")
public record RevisionValidationProperties(
        boolean enabled,
        String command,
        Duration installTimeout,
        Duration buildTimeout,
        int outputMaxChars
) {
}
