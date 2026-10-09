package com.singularity.workspace.service.impl;

import com.singularity.common.dto.FileChangeDto;
import com.singularity.common.dto.PublishRevisionRequest;
import com.singularity.common.dto.PublishRevisionResponse;
import com.singularity.common.error.ConflictException;
import com.singularity.common.error.FileStorageException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.workspace.dto.project.FileContentResponse;
import com.singularity.workspace.dto.project.SaveFileRequest;
import com.singularity.workspace.dto.project.SaveFileResponse;
import com.singularity.workspace.enums.RevisionSource;
import com.singularity.workspace.repository.ProjectFileRepository;
import com.singularity.workspace.service.FileEditService;
import com.singularity.workspace.service.ProjectFileService;
import com.singularity.workspace.service.RevisionPublisher;
import com.singularity.workspace.util.ContentHash;
import com.singularity.workspace.util.ProjectFilePath;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Saves a file a person changed by hand in the workspace's editor.
 *
 * <p>Handles: checking the file exists, checking the edit was made against the content the file still holds, and
 * publishing the new text as one {@code MANUAL_EDIT} revision through {@link RevisionPublisher} - the same
 * all-or-nothing pipeline an AI turn and a restore use, so a save by hand is in the history, can be undone, and
 * brings a running preview level with it. Saving content the file already holds writes nothing.
 *
 * <p>Only an existing file can be saved: creating, renaming and deleting files by hand are not built, so a path the
 * project does not have is a 404 and never a new file. The path goes through {@link ProjectFilePath} before it is
 * looked up, as every path does.
 *
 * <p>The check against the stored content is per file, by hash, and not the project's revision: a build that
 * changed other files while this one was open must not refuse the save. A file that did change underneath - a build
 * rewrote it, a collaborator saved it, it was restored - answers 409 and the person is asked to reload it. The check
 * and the publish are not one atomic step; the publisher's own compare-and-swap still makes each revision land whole
 * or not at all, and a build that finishes in that gap wins the file, as it would have a moment later.
 *
 * <p>A bean of its own, and nothing depends on it but the controller: {@code RevisionPublisherImpl} already sits in
 * a chain of beans that closing into a cycle only shows when a real context starts.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class FileEditServiceImpl implements FileEditService {

    private final ProjectFileRepository projectFileRepository;
    private final ProjectFileService projectFileService;
    private final RevisionPublisher revisionPublisher;

    @Override
    public SaveFileResponse saveFile(Long projectId, SaveFileRequest request, Long userId) {
        String path = ProjectFilePath.normalize(request.path());
        projectFileRepository.findByProjectIdAndPath(projectId, path)
                .orElseThrow(() -> new ResourceNotFoundException("File", path));

        FileContentResponse stored = projectFileService.getFileContent(projectId, path);
        if (!request.baseHash().equals(stored.hash())) {
            throw new ConflictException("This file has changed since you opened it. Reload it to see the newer "
                    + "version, then make your change again.");
        }

        String newHash = ContentHash.sha256Hex(request.content().getBytes(StandardCharsets.UTF_8));
        if (newHash.equals(stored.hash())) {
            return new SaveFileResponse(path, newHash, null);
        }

        PublishRevisionResponse published = revisionPublisher.publish(projectId, new PublishRevisionRequest(
                null, userId, RevisionSource.MANUAL_EDIT.name(),
                List.of(new FileChangeDto(path, FileChangeDto.ChangeType.EDIT, request.content()))));
        if (published.status() == PublishRevisionResponse.Status.CONFLICT) {
            throw new ConflictException("The project changed while your edit was being saved. Reload the file and "
                    + "try again.");
        }
        if (published.status() != PublishRevisionResponse.Status.APPLIED) {
            log.error("Manual edit of '{}' in projectId: {} was not applied ({}).", path, projectId, published.status());
            throw new FileStorageException("Couldn't save " + path + ". Nothing was changed - please try again.");
        }
        log.info("User {} saved '{}' by hand in projectId: {} as revision {}", userId, path, projectId, published.revisionId());
        return new SaveFileResponse(path, newHash, published.revisionId());
    }
}
