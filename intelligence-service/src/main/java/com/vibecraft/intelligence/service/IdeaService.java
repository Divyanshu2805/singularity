package com.vibecraft.intelligence.service;

import com.vibecraft.intelligence.dto.idea.ClarifyIdeaRequest;
import com.vibecraft.intelligence.dto.idea.ClarifyIdeaResponse;
import com.vibecraft.intelligence.dto.idea.CompileIdeaRequest;
import com.vibecraft.intelligence.dto.idea.CompileIdeaResponse;

/**
 * The pre-chat "idea clarifier": a short interview about a new project idea, and the brief compiled from it.
 * Runs before any project exists, so nothing here is project-scoped.
 */
public interface IdeaService {

    ClarifyIdeaResponse clarify(ClarifyIdeaRequest request);

    CompileIdeaResponse compile(CompileIdeaRequest request);
}
