package com.tcp.cleanmanagement.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;

public record AiObservation(String id, @JsonProperty("device_id") String deviceId,
        @JsonProperty("measured_at") String measuredAt, BigDecimal temperature, BigDecimal humidity,
        BigDecimal gas, @JsonProperty("sensor_model") String sensorModel) {}
