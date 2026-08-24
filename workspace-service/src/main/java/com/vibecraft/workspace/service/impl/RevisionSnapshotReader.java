package com.vibecraft.workspace.service.impl;

import com.vibecraft.workspace.repository.ProjectFileRevisionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Reconstructs a revision's full path-to-content-hash snapshot by walking its parent chain.
 *
 * <p>Handles: the one thing {@code RevisionServiceImpl.snapshot} and {@link RevisionBuildValidator} both need,
 * pulled into its own leaf component - a bean depending only on {@link ProjectFileRevisionRepository} - specifically
 * so it carries no dependency on {@link com.vibecraft.workspace.service.RevisionPublisher}. Before this existed,
 * {@code RevisionBuildValidator} depended on the whole {@code RevisionService} interface just for this one method,
 * and {@code RevisionServiceImpl} itself depends on {@code RevisionPublisher} (for {@code restore}) - which
 * {@code RevisionPublisherImpl} in turn depends on every {@code RevisionValidator} bean, including
 * {@code RevisionBuildValidator}. That closed a real bean-wiring cycle
 * (Internal­WorkspaceController → RevisionPublisherImpl → RevisionBuildValidator → RevisionServiceImpl →
 * RevisionPublisher → RevisionPublisherImpl) that no test caught, since none of this codebase's tests boot a real
 * Spring context - it only surfaced live-booting the service.
 */
@Component
@RequiredArgsConstructor
public class RevisionSnapshotReader {

    private final ProjectFileRevisionRepository revisionRepository;

    /** path -> content hash, for every path that exists (not deleted) as of the given revision. */
    public Map<String, String> snapshot(Long revisionId) {
        Map<String, String> snapshot = new LinkedHashMap<>();
        for (var row : revisionRepository.reconstructSnapshot(revisionId)) {
            if (!"DELETE".equals(row.getChangeType())) {
                snapshot.put(row.getPath(), row.getContentHash());
            }
        }
        return snapshot;
    }
}
