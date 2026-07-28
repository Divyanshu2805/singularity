package com.vibecraft.workspace.mapper;

import com.vibecraft.workspace.dto.project.FileNode;
import com.vibecraft.workspace.entity.ProjectFile;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.util.List;

/**
 * Turns file rows into the tree the editor reads.
 *
 * <p>Handles: one file or a list. modifiedAt needs an explicit mapping because the entity calls it updatedAt -
 * without it MapStruct matches nothing, compiles clean, and leaves the field null.
 */
@Mapper(componentModel = "spring")
public interface ProjectFileMapper {

    @Mapping(target = "modifiedAt", source = "updatedAt")
    FileNode toFileNode(ProjectFile projectFile);

    List<FileNode> toListOfFileNode(List<ProjectFile> projectFileList);
}
