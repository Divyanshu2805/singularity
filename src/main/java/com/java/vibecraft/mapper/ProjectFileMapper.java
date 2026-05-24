package com.java.vibecraft.mapper;

import com.java.vibecraft.dto.project.FileNode;
import com.java.vibecraft.entity.ProjectFile;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.util.List;

@Mapper(componentModel = "spring")
public interface ProjectFileMapper {

    @Mapping(target = "modifiedAt", source = "updatedAt")
    FileNode toFileNode(ProjectFile projectFile);

    List<FileNode> toListOfFileNode(List<ProjectFile> projectFileList);
}
