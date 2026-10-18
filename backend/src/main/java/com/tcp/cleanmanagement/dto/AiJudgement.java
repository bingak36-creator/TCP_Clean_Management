package com.tcp.cleanmanagement.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

@JsonIgnoreProperties(ignoreUnknown = true)
public record AiJudgement(@JsonProperty("device_id") String deviceId, String at, String level, String headline,
        @JsonProperty("model_version") String modelVersion, Map<String, Boolean> ready,
        Map<String, Object> environment, Map<String, String> unavailable, List<AiAlert> alerts) {
    public record AiAlert(String type, String level, String message) {}
}
