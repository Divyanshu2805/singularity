package com.singularity.workspace.util;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tests for {@link GitHubTokenCipher}, which keeps stored GitHub tokens unreadable and signs the state of a sign-in.
 *
 * <p>Handles: a token coming back as it went in and never being stored as itself, the same token encrypting
 * differently each time, a stored value that was altered or made under another key being refused, a key of the wrong
 * size stopping the service; and a state being accepted only for the person it was made for, only until it runs out,
 * and only with our signature on it - which is the whole of what stops a sign-in being finished in someone else's
 * session.
 */
class GitHubTokenCipherTest {

    private static final String KEY = Base64.getEncoder().encodeToString(new byte[32]);
    private static final Instant NOW = Instant.parse("2026-10-10T10:00:00Z");

    private final GitHubTokenCipher cipher = new GitHubTokenCipher(KEY);

    @Test
    void aTokenComesBackAsItWentInAndIsNeverStoredAsItself() {
        String stored = cipher.encrypt("gho_secret-token");

        assertThat(stored).doesNotContain("gho_secret-token");
        assertThat(new String(Base64.getDecoder().decode(stored), java.nio.charset.StandardCharsets.ISO_8859_1)).doesNotContain("gho_");
        assertThat(cipher.decrypt(stored)).isEqualTo("gho_secret-token");
    }

    @Test
    void theSameTokenEncryptsDifferentlyEachTime() {
        assertThat(cipher.encrypt("gho_x")).isNotEqualTo(cipher.encrypt("gho_x"));
    }

    @Test
    void aStoredValueThatWasAlteredOrMadeUnderAnotherKeyIsRefused() {
        byte[] bytes = Base64.getDecoder().decode(cipher.encrypt("gho_x"));
        bytes[bytes.length - 1] ^= 1;
        String altered = Base64.getEncoder().encodeToString(bytes);
        byte[] otherKey = new byte[32];
        otherKey[0] = 1;
        GitHubTokenCipher other = new GitHubTokenCipher(Base64.getEncoder().encodeToString(otherKey));

        assertThatThrownBy(() -> cipher.decrypt(altered)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> other.decrypt(cipher.encrypt("gho_x"))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> cipher.decrypt("not base64 !")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void aKeyOfTheWrongSizeStopsTheService() {
        assertThatThrownBy(() -> new GitHubTokenCipher(Base64.getEncoder().encodeToString(new byte[16])))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("32 bytes");
        assertThatThrownBy(() -> new GitHubTokenCipher("not-base64-at-all!")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void aStateIsGoodForThePersonItWasMadeForUntilItRunsOut() {
        String state = cipher.newState(7L, NOW, Duration.ofMinutes(10));

        assertThat(cipher.isStateFor(state, 7L, NOW.plusSeconds(599))).isTrue();
        assertThat(cipher.isStateFor(state, 7L, NOW.plusSeconds(601))).isFalse();
        assertThat(cipher.isStateFor(state, 8L, NOW)).isFalse();
        assertThat(state).matches("[A-Za-z0-9._-]+").hasSizeLessThan(200);
    }

    @Test
    void aStateThatWasChangedOrSignedWithAnotherKeyIsRefused() {
        String state = cipher.newState(7L, NOW, Duration.ofMinutes(10));
        String forSomeoneElse = "8" + state.substring(1);
        byte[] otherKey = new byte[32];
        otherKey[5] = 9;
        String foreign = new GitHubTokenCipher(Base64.getEncoder().encodeToString(otherKey)).newState(7L, NOW, Duration.ofMinutes(10));

        assertThat(cipher.isStateFor(forSomeoneElse, 8L, NOW)).isFalse();
        assertThat(cipher.isStateFor(foreign, 7L, NOW)).isFalse();
        assertThat(cipher.isStateFor(state + "x", 7L, NOW)).isFalse();
        assertThat(cipher.isStateFor("7.9999999999.abc", 7L, NOW)).isFalse();
        assertThat(cipher.isStateFor("", 7L, NOW)).isFalse();
        assertThat(cipher.isStateFor(null, 7L, NOW)).isFalse();
        assertThat(cipher.isStateFor("a".repeat(500), 7L, NOW)).isFalse();
    }

    @Test
    void twoStatesForOnePersonDiffer() {
        assertThat(cipher.newState(7L, NOW, Duration.ofMinutes(10))).isNotEqualTo(cipher.newState(7L, NOW, Duration.ofMinutes(10)));
    }
}
