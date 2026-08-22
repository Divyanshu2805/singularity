package com.vibecraft.workspace.service;

/**
 * Immutable, content-addressed storage for revision content (CODE_REVIEW.md AI-05), separate from the live
 * project-file layout.
 *
 * <p>Handles: writing a file's bytes once, keyed by their own hash (safe to retry, safe to dedup - the same content
 * written twice is the same object); materializing a blob into a project's live path key, the same way a fork
 * already copies files server-side; and removing a path from the live layout. Never deletes a blob - garbage
 * collection is deliberately out of scope until real usage shows it is needed (see docs/schema/).
 */
public interface BlobStore {

    /**
     * Uploads content under its own SHA-256 hash if no object with that hash exists yet, and returns the hash
     * either way. A no-op PUT for content already present - across projects, since the key carries no project id.
     */
    String putIfAbsent(byte[] content, String contentType);

    /** Reads a blob's full content back by hash. */
    byte[] read(String contentHash);

    /** Server-side copies a blob onto a project's live path key - no bytes re-uploaded. */
    void copyToLivePath(String contentHash, Long projectId, String path);

    /** Removes a path from the live layout. A no-op if the path does not exist there. */
    void removeLivePath(Long projectId, String path);
}
