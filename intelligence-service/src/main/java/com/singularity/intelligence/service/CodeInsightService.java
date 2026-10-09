package com.singularity.intelligence.service;

import com.singularity.intelligence.dto.code.AskCodeRequest;
import com.singularity.intelligence.dto.code.CodeInsightResponse;
import com.singularity.intelligence.dto.code.CodeNoteResponse;
import com.singularity.intelligence.dto.code.ExplainCodeRequest;
import com.singularity.intelligence.dto.code.GlossaryEntryResponse;
import com.singularity.intelligence.dto.code.GlossaryRequest;
import com.singularity.intelligence.dto.code.LessonRequest;
import com.singularity.intelligence.dto.code.OverviewRequest;
import com.singularity.intelligence.dto.code.SaveCodeNoteRequest;
import com.singularity.intelligence.dto.code.TaskCheckRequest;
import com.singularity.intelligence.dto.code.TaskRequest;
import com.singularity.intelligence.dto.code.TourRequest;
import com.singularity.intelligence.dto.code.TourResponse;
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
 * the session rather than taking one, so two members of a shared project never see each other's notes. The lesson
 * stream is teaching mode's explanation of what one step of a saved turn changed - asked for when the person opens
 * the step, never during the build, only for a turn that was asked for in teaching mode, and kept with the step once
 * written. The overview stream is the same thing for the turn as a whole - its big picture, shown before any step's
 * lesson - under the same conditions, and kept with the reply.
 *
 * <p>Three more things belong to the person's learning of the whole project and are kept for them alone, each asked
 * for by a press and never during a build: the tour of the project as it stands (written again only on request), a
 * glossary term defined with an example from their own code (written once and kept), and a "try changing this" task
 * set from a lesson's step, with a check of whether the person has made the change - read from the saved file by the
 * read-only model, which marks the task done when it finds it made.
 */
public interface CodeInsightService {

    CodeInsightResponse explain(Long projectId, ExplainCodeRequest request);

    CodeInsightResponse ask(Long projectId, AskCodeRequest request);

    Flux<String> streamExplain(Long projectId, ExplainCodeRequest request);

    Flux<String> streamAsk(Long projectId, AskCodeRequest request);

    Flux<String> streamLesson(Long projectId, LessonRequest request);

    Flux<String> streamOverview(Long projectId, OverviewRequest request);

    TourResponse getTour(Long projectId);

    Flux<String> streamTour(Long projectId, TourRequest request);

    List<GlossaryEntryResponse> getGlossary(Long projectId);

    Flux<String> streamTerm(Long projectId, GlossaryRequest request);

    void deleteTerm(Long projectId, Long entryId);

    Flux<String> streamTask(Long projectId, TaskRequest request);

    Flux<String> streamTaskCheck(Long projectId, TaskCheckRequest request);

    List<CodeNoteResponse> getNotes(Long projectId);

    CodeNoteResponse saveNote(Long projectId, SaveCodeNoteRequest request);

    void deleteNote(Long projectId, Long noteId);

    void clearNotes(Long projectId);
}
