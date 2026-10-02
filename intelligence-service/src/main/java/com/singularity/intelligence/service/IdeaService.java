package com.singularity.intelligence.service;

import com.singularity.intelligence.dto.idea.ClarifyIdeaRequest;
import com.singularity.intelligence.dto.idea.ClarifyIdeaResponse;
import com.singularity.intelligence.dto.idea.CompileIdeaRequest;
import com.singularity.intelligence.dto.idea.CompileIdeaResponse;

/**
 * The pre-chat idea clarifier: a short interview about a new idea, and the brief compiled from it.
 *
 * <p>Handles: producing the questions, and turning the answers into the brief. Runs before any project exists, so
 * nothing here is project-scoped.
 */
public interface IdeaService {

    ClarifyIdeaResponse clarify(ClarifyIdeaRequest request);

    CompileIdeaResponse compile(CompileIdeaRequest request);
}
