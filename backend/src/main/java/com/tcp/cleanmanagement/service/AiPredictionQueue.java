package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.config.AiProperties;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.enums.*;
import com.tcp.cleanmanagement.event.SensorDataSavedEvent;
import com.tcp.cleanmanagement.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

@Service
@RequiredArgsConstructor
public class AiPredictionQueue {
    private final AiProperties properties;
    private final SensorDataRawRepository readings;
    private final AiPredictionRepository predictions;

    // Persist the work in the SAME transaction as the source reading. Rollbacks cannot start inference.
    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void sensorSaved(SensorDataSavedEvent event) {
        if (properties.isEnabled()) readings.findById(event.getDataId()).ifPresent(this::enqueue);
    }

    public void enqueue(SensorDataRaw raw) {
        Sensor sensor = raw.getMetric().getSensor();
        if (raw.getMetric().getMetricCode() != MetricCode.GAS || sensor.getSensorModel() == SensorModel.MQ7) return;
        Zone zone = raw.getDeviceSetHistory() == null ? sensor.getZone() : raw.getDeviceSetHistory().getZone();
        if (zone == null || predictions.existsById(raw.getId())) return;
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        predictions.save(AiPrediction.builder().id(raw.getId()).sensor(sensor).zone(zone)
                .deviceSetHistory(raw.getDeviceSetHistory()).sampleKey(raw.getSampleKey())
                .measuredAt(raw.getMeasuredAt()).queuedAt(now).gasValue(raw.getMeasuredValue())
                .status(AiPredictionStatus.PENDING).nextAttemptAt(now).build());
    }
}
