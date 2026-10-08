package com.singularity.intelligence.config;

import com.singularity.intelligence.enums.AiCallKind;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.EnumMap;
import java.util.Map;

/**
 * Which model, and how much reasoning, each kind of model call asks for.
 *
 * <p>Handles: holding one optional model name and one optional reasoning effort per kind of call
 * ({@code ai.calls.<kind>.model}, {@code ai.calls.<kind>.reasoning-effort}), and answering for a kind that sets
 * neither.
 *
 * <p>A kind that sets nothing uses the service's one configured model with the provider's default reasoning, which is
 * how every call ran before this existed. The two are separate on purpose. A build has to be right, and is worth a
 * strong model; an interview question, a lesson or an explanation is a few hundred words that a smaller, faster model
 * writes as well, at a fraction of the price and wait. Reasoning is the other half of the wait: a model that reasons
 * before answering sends nothing while it does, so the effort a call asks for is most of the time to its first word.
 *
 * <p>The values are plain strings because they are the provider's own words - a model id, and whatever effort names
 * that provider accepts ({@code none}, {@code minimal}, {@code low}, {@code medium}, {@code high}). A value the
 * provider does not know is refused by the provider on the first call, not here.
 */
@ConfigurationProperties(prefix = "ai")
public record AiCallProperties(Map<AiCallKind, Call> calls) {

    public record Call(String model, String reasoningEffort) {

        public boolean isDefault() {
            return isBlank(model) && isBlank(reasoningEffort);
        }

        private static boolean isBlank(String value) {
            return value == null || value.isBlank();
        }
    }

    private static final Call DEFAULT = new Call(null, null);

    public AiCallProperties {
        Map<AiCallKind, Call> given = calls == null ? Map.of() : calls;
        calls = new EnumMap<>(AiCallKind.class);
        calls.putAll(given);
    }

    public Call of(AiCallKind kind) {
        Call call = calls.get(kind);
        return call == null ? DEFAULT : call;
    }

    public static AiCallProperties defaults() {
        return new AiCallProperties(null);
    }
}
