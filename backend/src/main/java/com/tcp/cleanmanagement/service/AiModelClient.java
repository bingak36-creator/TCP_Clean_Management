package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.AiJudgement;
import com.tcp.cleanmanagement.dto.AiObservation;
import java.util.Map;

public interface AiModelClient {
    void start();
    AiJudgement predict(AiObservation input);
    Map<String, Object> status();
}
