package com.vibecraft.workspace.mapper;

import com.vibecraft.workspace.dto.project.FileNode;
import com.vibecraft.workspace.entity.ProjectFile;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.util.List;

@Mapper(componentModel = "spring")
public interface ProjectFileMapper {

    @Mapping(target = "modifiedAt", source = "updatedAt")
    FileNode toFileNode(ProjectFile projectFile);

    List<FileNode> toListOfFileNode(List<ProjectFile> projectFileList);
}
