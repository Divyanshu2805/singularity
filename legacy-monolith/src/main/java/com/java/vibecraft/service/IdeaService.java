package com.java.vibecraft.service;

import com.java.vibecraft.dto.idea.ClarifyIdeaRequest;
import com.java.vibecraft.dto.idea.ClarifyIdeaResponse;
import com.java.vibecraft.dto.idea.CompileIdeaRequest;
import com.java.vibecraft.dto.idea.CompileIdeaResponse;

/**
 * The pre-chat "idea clarifier": a short interview about a new project idea, and the brief compiled from it.
 * Runs before any project exists, so nothing here is project-scoped.
 */
public interface IdeaService {

    ClarifyIdeaResponse clarify(ClarifyIdeaRequest request);

    CompileIdeaResponse compile(CompileIdeaRequest request);
}
