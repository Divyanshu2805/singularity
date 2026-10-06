package com.singularity.intelligence.dto.chat;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the cap on a chat message: a turn replays its message to the model with the whole conversation, so an
 * unbounded one would let a single request spend far more than the turn's token reservation. The cap must hold at the
 * bean-validation layer, before any budget is reserved or the model is called.
 */
class ChatRequestTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    @DisplayName("a message at the limit is accepted")
    void atTheLimitIsAccepted() {
        assertThat(validator.validate(new ChatRequest("x".repeat(16000), 1L, null))).isEmpty();
    }

    @Test
    @DisplayName("a message over the limit is rejected with the length message")
    void overTheLimitIsRejected() {
        var violations = validator.validate(new ChatRequest("x".repeat(16001), 1L, null));

        assertThat(violations).hasSize(1);
        assertThat(violations.iterator().next().getMessage()).contains("16000");
    }
}
