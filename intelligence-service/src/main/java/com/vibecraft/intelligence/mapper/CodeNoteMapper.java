package com.vibecraft.intelligence.mapper;

import com.vibecraft.intelligence.dto.code.CodeNoteResponse;
import com.vibecraft.intelligence.dto.code.CodeNoteSelection;
import com.vibecraft.intelligence.entity.CodeNote;
import org.mapstruct.Mapper;

import java.util.List;

/**
 * Turns saved code notes into the shape the notes panel reads.
 *
 * <p>Handles: one note or a list, folding the four flat selection columns into one nested selection - and into no
 * selection at all when they are empty.
 *
 * <p>Hand-written rather than generated because that folding is a decision, not a field-name match: a note with no
 * selection must come back with the field absent, not an object full of nulls.
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
