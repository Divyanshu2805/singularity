package com.vibecraft.intelligence.service;

import com.vibecraft.intelligence.dto.code.AskCodeRequest;
import com.vibecraft.intelligence.dto.code.CodeInsightResponse;
import com.vibecraft.intelligence.dto.code.CodeNoteResponse;
import com.vibecraft.intelligence.dto.code.ExplainCodeRequest;
import com.vibecraft.intelligence.dto.code.SaveCodeNoteRequest;
import reactor.core.publisher.Flux;

import java.util.List;

/**
 * Explains a selected block of code, and answers follow-up questions about it.
 *
 * <p>Handles: the explain and ask answers, whole and streamed, and the caller's saved notes - reading, saving,
 * deleting one and clearing them.
 *
 * <p>Read-only by construction: the answering methods are given exactly one tool, reading files, and their prompts
 * never mention the file-writing protocol - so they can produce text and nothing else. The note methods write, but
 * only to the caller's own notes.
 *
 * <p>Private to the caller: a note belongs to one project and one user, and every note method resolves the user from
 * the session rather than taking one, so two members of a shared project never see each other's notes. It sits
 * alongside teaching mode - that explains code as it is written, this explains code that is already there, on demand.
 */
public interface CodeInsightService {

    CodeInsightResponse explain(Long projectId, ExplainCodeRequest request);

    CodeInsightResponse ask(Long projectId, AskCodeRequest request);

    Flux<String> streamExplain(Long projectId, ExplainCodeRequest request);

    Flux<String> streamAsk(Long projectId, AskCodeRequest request);

    List<CodeNoteResponse> getNotes(Long projectId);

    CodeNoteResponse saveNote(Long projectId, SaveCodeNoteRequest request);

    void deleteNote(Long projectId, Long noteId);

    void clearNotes(Long projectId);
}
