package com.java.vibecraft.controller;

import com.java.vibecraft.dto.idea.ClarifyIdeaRequest;
import com.java.vibecraft.dto.idea.ClarifyIdeaResponse;
import com.java.vibecraft.dto.idea.CompileIdeaRequest;
import com.java.vibecraft.dto.idea.CompileIdeaResponse;
import com.java.vibecraft.service.IdeaService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ideas")
@RequiredArgsConstructor
public class IdeaController {

    private final IdeaService ideaService;

    @PostMapping("/clarify")
    public ResponseEntity<ClarifyIdeaResponse> clarify(@RequestBody @Valid ClarifyIdeaRequest request) {
        return ResponseEntity.ok(ideaService.clarify(request));
    }

    @PostMapping("/compile")
    public ResponseEntity<CompileIdeaResponse> compile(@RequestBody @Valid CompileIdeaRequest request) {
        return ResponseEntity.ok(ideaService.compile(request));
    }
}
