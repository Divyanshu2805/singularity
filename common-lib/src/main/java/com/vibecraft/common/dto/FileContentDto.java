package com.vibecraft.common.dto;

/**
 * A project file's path and full text content, as served/accepted over workspace-service's internal API.
 * One shape serves both directions — the read response (backs {@code CodeGenerationTools.readFiles} and
 * {@code AiGenerationServiceImpl}'s pre-edit file snapshot) and the write request body (backs
 * {@code finalizeChats}'s {@code <file>} tag handling) — since both are just "this path has this content."
 */
public record FileContentDto(
        String path,
        String content
) {
}
