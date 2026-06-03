package com.java.vibecraft.service;

import com.java.vibecraft.dto.chat.StreamResponse;
import reactor.core.publisher.Flux;

public interface AiGenerationService {
    Flux<StreamResponse> streamResponse(String message, Long projectId, boolean teachingMode);
}
