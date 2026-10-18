package com.tcp.cleanmanagement.job;

import com.tcp.cleanmanagement.config.AiProperties;
import com.tcp.cleanmanagement.dto.*;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.enums.*;
import com.tcp.cleanmanagement.repository.*;
import com.tcp.cleanmanagement.service.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;

@Slf4j
@Component
public class AiPredictionJob {
    private final AiProperties properties;
    private final OperationalSettingsService settings;
    private final AiPredictionRepository predictions;
    private final SensorDataRawRepository readings;
    private final SensorRepository sensors;
    private final AlertRepository alerts;
    private final AiPredictionQueue queue;
    private final AiObservationAssembler assembler;
    private final AiModelClient model;
    private final JsonMapper mapper;
    private final TransactionTemplate tx;
    private final Map<String, String> restoredSessions = new HashMap<>();
    private static final List<AiPredictionStatus> WORK = List.of(AiPredictionStatus.PENDING,
            AiPredictionStatus.RETRY, AiPredictionStatus.RUNNING);
    static final int MAX_ATTEMPTS = 10;

    public AiPredictionJob(AiProperties properties, AiPredictionRepository predictions,
            SensorDataRawRepository readings, SensorRepository sensors, AlertRepository alerts,
            AiPredictionQueue queue, AiObservationAssembler assembler, AiModelClient model,
            JsonMapper mapper, PlatformTransactionManager manager, OperationalSettingsService settings) {
        this.settings=settings;
        this.properties = properties; this.predictions = predictions; this.readings = readings;
        this.sensors = sensors; this.alerts = alerts; this.queue = queue; this.assembler = assembler;
        this.model = model; this.mapper = mapper; this.tx = new TransactionTemplate(manager);
    }

    @EventListener(ApplicationReadyEvent.class)
    public void loadModels() {
        if (!properties.isEnabled()) return;
        try { model.start(); } catch (RuntimeException error) {
            log.warn("AI models could not start; sensor ingestion remains available and queued work will retry");
        }
    }

    @Scheduled(fixedDelayString = "${restroom-ai.poll-interval-ms:1000}", initialDelay = 3000)
    public synchronized void processPending() {
        if (!properties.isEnabled()) return;
        try {
            // Backfill bounded recent history after a restart/deployment; also recovers missed events.
            tx.executeWithoutResult(status -> readings.findAiBackfill(MetricCode.GAS, SensorModel.MQ7,
                    now().minusHours(Math.max(0, Math.min(24, properties.getBackfillHours()))),
                    PageRequest.of(0, 500)).forEach(queue::enqueue));
            List<Long> ids = tx.execute(status -> predictions
                    .findByStatusInAndNextAttemptAtLessThanEqualOrderByMeasuredAtAscIdAsc(WORK, now(),
                            PageRequest.of(0, Math.max(1, Math.min(200, properties.getBatchSize()))))
                    .stream().map(AiPrediction::getId).toList());
            if (ids == null) return;
            for (Long id : ids) {
                Task task = tx.execute(status -> claim(id));
                if (task == null) continue;
                try {
                    restoreHistory(task.input());
                    AiJudgement result = model.predict(task.input());
                    tx.executeWithoutResult(status -> complete(task, result));
                } catch (PythonAiModelClient.AiInputException error) {
                    tx.executeWithoutResult(status -> fail(task, error.getMessage(), true));
                } catch (RuntimeException error) {
                    tx.executeWithoutResult(status -> fail(task, "AI inference failed; retry scheduled", false));
                    log.warn("AI prediction {} failed ({}); source data remains stored", id, error.getClass().getSimpleName());
                }
            }
        } catch (RuntimeException error) {
            log.warn("AI queue processing deferred ({})", error.getClass().getSimpleName());
        }
    }

    private Task claim(Long id) {
        AiPrediction row = predictions.findLocked(id).orElse(null);
        LocalDateTime now = now();
        if (row == null || !WORK.contains(row.getStatus()) || row.getNextAttemptAt().isAfter(now)) return null;
        if (predictions.hasEarlierWork(row.getSensor().getId(), row.getMeasuredAt(), row.getId(), WORK)) {
            row.setStatus(AiPredictionStatus.PENDING); row.setNextAttemptAt(now.plusSeconds(1));
            row.setError("Waiting for an earlier packet from this sensor"); return null;
        }
        if (row.getMeasuredAt().isAfter(now.plusMinutes(5))) {
            skip(row, "Sample timestamp is in the future"); return null;
        }
        var assembly = assembler.assemble(row);
        if (assembly.input() == null) {
            if (assembly.waiting() && row.getQueuedAt().plusSeconds(Math.max(1, properties.getInputWaitSeconds())).isAfter(now)) {
                row.setStatus(AiPredictionStatus.PENDING); row.setError(assembly.reason());
                row.setNextAttemptAt(now.plusSeconds(2));
            } else skip(row, assembly.reason());
            return null;
        }
        row.setDeviceId(assembly.input().deviceId());
        row.setSensorModel(assembly.input().sensorModel());
        row.setTemperature(assembly.input().temperature()); row.setHumidity(assembly.input().humidity());
        row.setStatus(AiPredictionStatus.RUNNING); row.setAttempts(row.getAttempts() + 1);
        row.setNextAttemptAt(now.plusSeconds(Math.max(300L, properties.getTimeoutSeconds() * 2L)));
        row.setError(null);
        return new Task(id, row.getAttempts(), assembly.input());
    }

    private void restoreHistory(AiObservation current) {
        model.start();
        String session = String.valueOf(model.status().getOrDefault("sessionId", "default"));
        if (session.equals(restoredSessions.get(current.deviceId()))) return;
        LocalDateTime until = java.time.OffsetDateTime.parse(current.measuredAt())
                .withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
        List<AiObservation> history = tx.execute(status -> predictions
                .findByDeviceIdAndStatusAndMeasuredAtGreaterThanEqualAndMeasuredAtLessThanOrderByMeasuredAtAscIdAsc(
                        current.deviceId(), AiPredictionStatus.COMPLETE,
                        until.minusHours(Math.max(0, Math.min(24, properties.getBackfillHours()))), until,
                        PageRequest.of(0, 6000)).stream()
                .filter(row -> row.getTemperature() != null && row.getHumidity() != null && row.getSensorModel() != null)
                .map(row -> new AiObservation(row.getId().toString(), row.getDeviceId(),
                        row.getMeasuredAt().atOffset(ZoneOffset.UTC).toString(), row.getTemperature(),
                        row.getHumidity(), row.getGasValue(), row.getSensorModel())).toList());
        if (history != null) for (AiObservation old : history) model.predict(old);
        restoredSessions.put(current.deviceId(), session);
    }

    private void complete(Task task, AiJudgement result) {
        AiPrediction row = owned(task);
        if (row == null) return;
        if (!Objects.equals(result.deviceId(), task.input().deviceId()) || result.alerts() == null
                || result.ready() == null || result.level() == null || result.modelVersion() == null) {
            throw new IllegalArgumentException("Invalid model result");
        }
        if (!Boolean.TRUE.equals(result.ready().get("environment")) && !result.alerts().isEmpty()) {
            throw new IllegalArgumentException("Unready models cannot issue alerts");
        }
        row.setStatus(AiPredictionStatus.COMPLETE); row.setLevel(result.level()); row.setHeadline(result.headline());
        row.setModelVersion(result.modelVersion()); row.setResultJson(mapper.writeValueAsString(result));
        row.setPredictedAt(now()); row.setError(null);
        // Serialize alert creation per sensor across workers; keep AI incidents separate from rule alerts.
        sensors.findByIdForUpdate(row.getSensor().getId()).orElseThrow();
        if(Boolean.FALSE.equals(row.getZone().getIsActive()) || Boolean.FALSE.equals(row.getSensor().getZone().getIsActive())) return;
        if(row.getMeasuredAt().isBefore(now().minusSeconds(settings.offlineSeconds()))) return;
        for (AiJudgement.AiAlert item : result.alerts()) {
            AlertType type = AlertType.valueOf(item.type());
            Long historyId = row.getDeviceSetHistory() == null ? null : row.getDeviceSetHistory().getId();
            if (!alerts.existsBySensorIdAndAlertTypeAndStatusAndDetectionSourceAndDeviceSetHistoryId(
                    row.getSensor().getId(), type, AlertStatus.UNRESOLVED, "AI", historyId)) {
                alerts.save(Alert.builder().zone(row.getZone()).sensor(row.getSensor())
                        .deviceSetHistory(row.getDeviceSetHistory()).alertType(type).status(AlertStatus.UNRESOLVED)
                        .message(item.message()).detectionSource("AI").modelVersion(result.modelVersion())
                        .level(item.level()).build());
            }
        }
    }

    private void fail(Task task, String reason, boolean invalidInput) {
        AiPrediction row = owned(task);
        if (row == null) return;
        if (invalidInput) { skip(row, reason); return; }
        // Later packets of this sensor wait for this one, so an endlessly failing job must end.
        if (row.getAttempts() >= MAX_ATTEMPTS) { skip(row, "AI inference failed " + MAX_ATTEMPTS + " times"); return; }
        row.setStatus(AiPredictionStatus.RETRY); row.setError(reason);
        row.setNextAttemptAt(now().plusSeconds(Math.min(300L, 10L * Math.max(1, row.getAttempts()))));
    }

    private AiPrediction owned(Task task) {
        return predictions.findLocked(task.id()).filter(row -> row.getStatus() == AiPredictionStatus.RUNNING
                && row.getAttempts() == task.attempt()).orElse(null);
    }
    private void skip(AiPrediction row, String reason) {
        row.setStatus(AiPredictionStatus.SKIPPED); row.setError(reason); row.setLevel("판정 불가");
        row.setHeadline(reason); row.setPredictedAt(now());
    }
    private LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
    private record Task(Long id, int attempt, AiObservation input) {}
}
