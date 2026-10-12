package com.singularity.workspace.service.impl;

import com.singularity.common.dto.FileChangeDto;
import com.singularity.common.dto.PublishRevisionRequest;
import com.singularity.common.dto.PublishRevisionResponse;
import com.singularity.common.error.ConflictException;
import com.singularity.common.error.FileStorageException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.workspace.dto.project.CreateFileRequest;
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
 * What a person does to a project's files by hand in the workspace: saving one, adding one, removing one.
 *
 * <p>Handles: for a save, checking the file exists, checking the edit was made against the content the file still
 * holds, and publishing the new text; for a new file, checking nothing is at that path and publishing it empty; for
 * a removal, checking the file exists and publishing its deletion. Each is one {@code MANUAL_EDIT} revision through
 * {@link RevisionPublisher} - the same all-or-nothing pipeline an AI turn and a restore use, so it is in the
 * history, can be undone, and brings a running preview level with it. Saving content the file already holds writes
 * nothing.
 *
 * <p>A save never makes a file: a path the project does not have is a 404 there, and a new file is its own request,
 * which is refused when the path is taken - by a file, or by a folder of that name, since a file and a folder cannot
 * share a path in the ZIP or in a preview. A new file starts empty and is filled by a save. Renaming is not built;
 * it is a new file and a removal. Every path goes through {@link ProjectFilePath} before it is looked up, and the
 * project's file-count and size limits are the publisher's, as for every write. Adding and removing files by hand
 * came after the owner had to ask the chat to add an environment file and to delete a stray one.
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

    @Override
    public SaveFileResponse createFile(Long projectId, CreateFileRequest request, Long userId) {
        String path = ProjectFilePath.normalize(request.path());
        if (projectFileRepository.findByProjectIdAndPath(projectId, path).isPresent()) {
            throw new ConflictException("There is already a file at " + path + ".");
        }
        boolean clashesWithAFolder = projectFileRepository.findByProjectId(projectId).stream()
                .map(file -> file.getPath())
                .anyMatch(existing -> existing.startsWith(path + "/") || path.startsWith(existing + "/"));
        if (clashesWithAFolder) {
            throw new ConflictException("A file and a folder cannot share the name " + path + ". Choose another.");
        }
        PublishRevisionResponse published = publish(projectId, userId, new FileChangeDto(path, FileChangeDto.ChangeType.EDIT, ""),
                "Couldn't add " + path + ". Nothing was changed - please try again.");
        log.info("User {} added '{}' by hand in projectId: {} as revision {}", userId, path, projectId, published.revisionId());
        return new SaveFileResponse(path, ContentHash.sha256Hex(new byte[0]), published.revisionId());
    }

    @Override
    public Long deleteFile(Long projectId, String rawPath, Long userId) {
        String path = ProjectFilePath.normalize(rawPath);
        projectFileRepository.findByProjectIdAndPath(projectId, path)
                .orElseThrow(() -> new ResourceNotFoundException("File", path));
        PublishRevisionResponse published = publish(projectId, userId, new FileChangeDto(path, FileChangeDto.ChangeType.DELETE, null),
                "Couldn't delete " + path + ". Nothing was changed - please try again.");
        log.info("User {} deleted '{}' by hand in projectId: {} as revision {}", userId, path, projectId, published.revisionId());
        return published.revisionId();
    }

    private PublishRevisionResponse publish(Long projectId, Long userId, FileChangeDto change, String failure) {
        PublishRevisionResponse published = revisionPublisher.publish(projectId, new PublishRevisionRequest(
                null, userId, RevisionSource.MANUAL_EDIT.name(), List.of(change)));
        if (published.status() == PublishRevisionResponse.Status.CONFLICT) {
            throw new ConflictException("The project changed while that was being saved. Try again.");
        }
        if (published.status() != PublishRevisionResponse.Status.APPLIED) {
            log.error("A change by hand to '{}' in projectId: {} was not applied ({}).", change.path(), projectId, published.status());
            throw new FileStorageException(failure);
        }
        return published;
    }
}
