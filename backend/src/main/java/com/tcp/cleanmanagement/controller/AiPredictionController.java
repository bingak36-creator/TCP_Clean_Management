package com.tcp.cleanmanagement.controller;

import com.tcp.cleanmanagement.dto.AiJudgement;
import com.tcp.cleanmanagement.entity.AiPrediction;
import com.tcp.cleanmanagement.enums.AiPredictionStatus;
import com.tcp.cleanmanagement.repository.AiPredictionRepository;
import com.tcp.cleanmanagement.service.AiModelClient;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

@RestController
@RequestMapping("/api/admin/ai")
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AiPredictionController {
    private final AiPredictionRepository predictions;
    private final AiModelClient model;
    private final com.tcp.cleanmanagement.service.OperationalSettingsService settings;
    private final JsonMapper mapper;
    private final com.tcp.cleanmanagement.security.AccessService access;

    @GetMapping("/status")
    public Map<String, Object> status() {
        access.requireDeveloper();
        Map<String, Long> counts = new LinkedHashMap<>();
        for (var state : AiPredictionStatus.values()) counts.put(state.name(), predictions.countByStatus(state));
        return Map.of("model", model.status(), "predictions", counts);
    }

    @GetMapping("/predictions")
    public List<Prediction> predictions(@RequestParam(required = false) Long zoneId,
                                       @RequestParam(defaultValue = "50") int limit) {
        if (limit < 1 || limit > 200 || zoneId != null && zoneId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid prediction query");
        }
        if (zoneId != null) access.requireZone(zoneId);
        var page = PageRequest.of(0, limit);
        // Restrict by zone in the query; filtering after the limit would hide a manager's own rows.
        List<Long> scope = zoneId != null ? List.of(zoneId) : access.isDeveloper() ? null : access.current().zoneIds();
        var rows = scope == null ? predictions.findAllByOrderByMeasuredAtDescIdDesc(page)
                : scope.isEmpty() ? List.<AiPrediction>of()
                : predictions.findByZoneIdInOrderByMeasuredAtDescIdDesc(scope, page);
        return rows.stream().filter(r -> access.canZone(r.getZone().getId())).map(this::response).toList();
    }

    @GetMapping("/sensors/{sensorId}/latest")
    public Prediction latest(@PathVariable Long sensorId) {
        access.requireSensor(sensorId);
        return response(predictions.findFirstBySensorIdOrderByMeasuredAtDescIdDesc(sensorId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No AI prediction for this gas sensor")));
    }

    private Prediction response(AiPrediction row) {
        return new Prediction(row.getId(), row.getSensor().getId(), row.getZone().getId(), row.getDeviceId(),
                row.getSampleKey(), row.getStatus().name(), row.getAttempts(),
                row.getMeasuredAt().atOffset(ZoneOffset.UTC),
                row.getPredictedAt() == null ? null : row.getPredictedAt().atOffset(ZoneOffset.UTC),
                row.getMeasuredAt().isBefore(LocalDateTime.now(ZoneOffset.UTC).minusSeconds(settings.offlineSeconds())),
                row.getTemperature(), row.getHumidity(), row.getGasValue(), row.getLevel(), row.getHeadline(),
                row.getError(), row.getResultJson() == null ? null : mapper.readValue(row.getResultJson(), AiJudgement.class));
    }

    public record Prediction(Long readingId, Long sensorId, Long zoneId, String deviceId, String sampleKey,
            String status, int attempts, OffsetDateTime measuredAt, OffsetDateTime predictedAt, boolean stale,
            BigDecimal temperature, BigDecimal humidity, BigDecimal gas, String level, String headline,
            String error, AiJudgement judgement) {}
}
