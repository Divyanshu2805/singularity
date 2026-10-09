package com.singularity.workspace.util;

import com.singularity.common.error.BadRequestException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * What a published app's link name may be. The name is the first label of a hostname on a domain the product owns, so
 * these are the cases that keep one page from passing for the product or being read as a preview.
 */
class PublishedSlugTest {

    @ParameterizedTest
    @ValueSource(strings = {"my-todo-app", "abc", "a1b", "todo-7k2q", "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"})
    @DisplayName("an ordinary DNS label is accepted")
    void accepts(String slug) {
        assertThat(PublishedSlug.validate(slug)).isEqualTo(slug);
    }

    @Test
    @DisplayName("a name is lower-cased and trimmed, not refused for the capitals")
    void normalises() {
        assertThat(PublishedSlug.validate("  My-App-1  ")).isEqualTo("my-app-1");
    }

    @ParameterizedTest
    @ValueSource(strings = {"www", "api", "app", "singularity", "vibecraft", "admin", "login", "billing", "preview", "WWW", "Api"})
    @DisplayName("the product's own words are refused, in any case")
    void refusesReservedNames(String slug) {
        assertThatThrownBy(() -> PublishedSlug.validate(slug)).isInstanceOf(BadRequestException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"p12-abcdefghij", "p1-x", "p999-anything-at-all"})
    @DisplayName("a name shaped like a preview's hostname is refused, so the proxy cannot mistake it for one")
    void refusesPreviewShapedNames(String slug) {
        assertThatThrownBy(() -> PublishedSlug.validate(slug)).isInstanceOf(BadRequestException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ab", "-abc", "abc-", "a--b", "xn--abc", "has space", "under_score", "dot.ted", "slash/ed",
            "ünïcode", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "", "   "})
    @DisplayName("anything that is not a plain label of the right length is refused")
    void refusesMalformedNames(String slug) {
        assertThatThrownBy(() -> PublishedSlug.validate(slug)).isInstanceOf(BadRequestException.class);
    }

    @Test
    @DisplayName("null is refused")
    void refusesNull() {
        assertThatThrownBy(() -> PublishedSlug.validate(null)).isInstanceOf(BadRequestException.class);
    }

    @Test
    @DisplayName("isValid agrees with validate")
    void isValidAgrees() {
        assertThat(PublishedSlug.isValid("my-app")).isTrue();
        assertThat(PublishedSlug.isValid("www")).isFalse();
    }

    @RepeatedTest(25)
    @DisplayName("a suggested name is always one the rules accept")
    void suggestionsAreAlwaysValid() {
        assertThat(PublishedSlug.isValid(PublishedSlug.suggest("My Fancy Todo App!!"))).isTrue();
        assertThat(PublishedSlug.isValid(PublishedSlug.suggest("p12"))).isTrue();
        assertThat(PublishedSlug.isValid(PublishedSlug.suggest("   "))).isTrue();
        assertThat(PublishedSlug.isValid(PublishedSlug.suggest(null))).isTrue();
        assertThat(PublishedSlug.isValid(PublishedSlug.suggest("日本語のアプリ"))).isTrue();
        assertThat(PublishedSlug.isValid(PublishedSlug.suggest("x".repeat(500)))).isTrue();
    }

    @Test
    @DisplayName("a suggestion is made from the project's title, with four random characters on the end")
    void suggestionShape() {
        assertThat(PublishedSlug.suggest("My Todo App")).matches("my-todo-app-[a-z2-9]{4}");
        assertThat(PublishedSlug.suggest("Café Menu")).matches("cafe-menu-[a-z2-9]{4}");
        assertThat(PublishedSlug.suggest("")).matches("app-[a-z2-9]{4}");
    }

    @Test
    @DisplayName("a title that would make a preview-shaped name gets a prefix instead")
    void suggestionAvoidsPreviewShape() {
        assertThat(PublishedSlug.suggest("p12")).startsWith("app-p12-");
    }

    @Test
    @DisplayName("two suggestions for the same title differ")
    void suggestionsDiffer() {
        assertThat(PublishedSlug.suggest("same title")).isNotEqualTo(PublishedSlug.suggest("same title"));
    }
}
