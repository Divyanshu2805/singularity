package com.singularity.workspace.util;

import com.singularity.common.error.BadRequestException;

import java.security.SecureRandom;
import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The one definition of what a published app's link name may be, and where a suggested one comes from.
 *
 * <p>Handles: checking a chosen name - one DNS label of lower-case letters, digits and hyphens, 3 to 40 characters,
 * not starting or ending with a hyphen, with no two hyphens in a row (a label with "--" in its third and fourth place
 * is reserved for internationalised names), not one of the product's own words, and not shaped like a preview's
 * hostname - and making a name from a project's title with four random characters on the end.
 *
 * <p>The name becomes the first label of a hostname on a domain the product owns, so this is a security boundary and
 * not tidiness: {@code www}, {@code api}, {@code singularity} and their kind would let a page pass for the product,
 * and a name like {@code p12-abcdefghij} would be read by the proxy as the preview of project 12 instead of a published
 * app. The proxy repeats the shape check; a name that reaches storage has passed it here first.
 */
public final class PublishedSlug {

    public static final int MIN_LENGTH = 3;
    public static final int MAX_LENGTH = 40;

    private static final int STEM_LENGTH = 30;
    private static final String SUFFIX_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern LABEL = Pattern.compile("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$");
    private static final Pattern PREVIEW_HOST = Pattern.compile("^p\\d+-.*");

    private static final Set<String> RESERVED = Set.of(
            "www", "api", "app", "apps", "admin", "administrator", "assets", "static", "cdn", "media", "files",
            "mail", "email", "smtp", "imap", "ftp", "ns1", "ns2", "dns", "mx",
            "login", "signin", "signup", "register", "auth", "oauth", "sso", "account", "accounts", "billing", "pay",
            "payment", "payments", "checkout", "support", "help", "status", "docs", "blog", "dashboard", "console",
            "singularity", "vibecraft", "preview", "previews", "publish", "published", "proxy", "gateway",
            "internal", "staging", "stage", "test", "testing", "dev", "prod", "production", "localhost", "root",
            "security", "abuse", "about", "terms", "privacy", "legal", "share", "shared", "embed", "download");

    private PublishedSlug() {
    }

    public static String validate(String candidate) {
        if (candidate == null || candidate.isBlank()) {
            throw new BadRequestException("Choose a name for the link.");
        }
        String slug = candidate.strip().toLowerCase(Locale.ROOT);
        if (slug.length() < MIN_LENGTH || slug.length() > MAX_LENGTH) {
            throw new BadRequestException("The link name must be " + MIN_LENGTH + " to " + MAX_LENGTH + " characters.");
        }
        if (!LABEL.matcher(slug).matches() || slug.contains("--")) {
            throw new BadRequestException("The link name can use lower-case letters, numbers and single hyphens, "
                    + "and can't start or end with a hyphen.");
        }
        if (RESERVED.contains(slug) || PREVIEW_HOST.matcher(slug).matches()) {
            throw new BadRequestException("That link name isn't available. Choose another.");
        }
        return slug;
    }

    public static boolean isValid(String candidate) {
        try {
            validate(candidate);
            return true;
        } catch (BadRequestException e) {
            return false;
        }
    }

    public static String suggest(String projectName) {
        String stem = stemOf(projectName);
        StringBuilder suffix = new StringBuilder();
        for (int i = 0; i < 4; i++) {
            suffix.append(SUFFIX_ALPHABET.charAt(RANDOM.nextInt(SUFFIX_ALPHABET.length())));
        }
        String slug = stem + "-" + suffix;
        return PREVIEW_HOST.matcher(slug).matches() ? "app-" + slug : slug;
    }

    static String stemOf(String projectName) {
        String ascii = Normalizer.normalize(projectName == null ? "" : projectName, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "");
        String dashed = ascii.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
        if (dashed.length() > STEM_LENGTH) {
            dashed = dashed.substring(0, STEM_LENGTH).replaceAll("-+$", "");
        }
        return dashed.isEmpty() ? "app" : dashed;
    }
}
