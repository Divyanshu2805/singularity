package com.vibecraft.intelligence.service;

import com.vibecraft.intelligence.dto.code.AskCodeRequest;
import com.vibecraft.intelligence.dto.code.CodeInsightResponse;
import com.vibecraft.intelligence.dto.code.CodeNoteResponse;
import com.vibecraft.intelligence.dto.code.ExplainCodeRequest;
import com.vibecraft.intelligence.dto.code.SaveCodeNoteRequest;
import reactor.core.publisher.Flux;

import java.util.List;

/**
 * Explains a selected block of code, and answers follow-up questions about it. Sits alongside teaching mode:
 * teaching mode explains code as it's written, this explains code that's already there, on demand.
 *
 * <p><b>Read-only by construction.</b> None of the answering methods can change a project: the only tool they
 * are given is {@code read_files}, and the prompts forbid the {@code <file>} protocol the generation pipeline
 * uses - this can produce text and nothing else. The note methods write, but only to the caller's own notes.
 *
 * <p><b>Private to the caller.</b> A saved note belongs to one project <em>and</em> one user, and every note
 * method resolves the user from the JWT rather than taking one - so two members of a shared project never see
 * each other's notes, exactly as the project chat behaves. The thread is kept until its author deletes it;
 * there is no expiry.
 */
public interface CodeInsightService {

    CodeInsightResponse explain(Long projectId, ExplainCodeRequest request);

    CodeInsightResponse ask(Long projectId, AskCodeRequest request);

    /** The same answer as {@link #explain}, streamed token by token so it can be read as it arrives. */
    Flux<String> streamExplain(Long projectId, ExplainCodeRequest request);

    /** The same answer as {@link #ask}, streamed token by token. */
    Flux<String> streamAsk(Long projectId, AskCodeRequest request);

    /** The caller's saved thread for this project, oldest first. Empty when they've never asked anything. */
    List<CodeNoteResponse> getNotes(Long projectId);

    /** Keeps one finished exchange. Called once the answer has arrived, not while it's streaming. */
    CodeNoteResponse saveNote(Long projectId, SaveCodeNoteRequest request);

    /** Wipes one exchange - the question, its answer and the block it quoted - leaving the rest. */
    void deleteNote(Long projectId, Long noteId);

    /** Wipes the caller's whole thread for this project. */
    void clearNotes(Long projectId);
}
