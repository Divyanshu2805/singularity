package com.java.vibecraft.mapper;

import com.java.vibecraft.dto.code.CodeNoteResponse;
import com.java.vibecraft.dto.code.CodeNoteSelection;
import com.java.vibecraft.entity.CodeNote;
import org.mapstruct.Mapper;

import java.util.List;

/**
 * Hand-written rather than generated: the entity keeps the selection flat (so it is just four nullable
 * columns) while the DTO nests it, and "all four columns are null" has to become one absent selection rather
 * than an object full of nulls - which is a decision, not a field-name match.
 */
@Mapper(componentModel = "spring")
public interface CodeNoteMapper {

    default CodeNoteResponse toCodeNoteResponse(CodeNote note) {
        if (note == null) {
            return null;
        }
        return new CodeNoteResponse(
                note.getId(),
                note.getQuestion(),
                note.getAnswer(),
                toSelection(note),
                note.getCreatedAt());
    }

    default List<CodeNoteResponse> fromListOfCodeNote(List<CodeNote> notes) {
        return notes == null ? List.of() : notes.stream().map(this::toCodeNoteResponse).toList();
    }

    private CodeNoteSelection toSelection(CodeNote note) {
        if (note.getSelectionCode() == null || note.getSelectionCode().isBlank()) {
            return null;
        }
        return new CodeNoteSelection(
                note.getSelectionPath(),
                note.getSelectionCode(),
                note.getSelectionStartLine(),
                note.getSelectionEndLine());
    }
}
