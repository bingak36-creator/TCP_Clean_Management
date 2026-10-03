package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.entity.Alert;
import com.tcp.cleanmanagement.entity.DeviceSetHistory;
import com.tcp.cleanmanagement.entity.Sensor;
import com.tcp.cleanmanagement.entity.SensorDataRaw;
import com.tcp.cleanmanagement.entity.SensorMetric;
import com.tcp.cleanmanagement.entity.Zone;
import com.tcp.cleanmanagement.enums.AlertStatus;
import com.tcp.cleanmanagement.enums.AlertType;
import com.tcp.cleanmanagement.enums.MetricCode;
import com.tcp.cleanmanagement.event.SensorDataSavedEvent;
import com.tcp.cleanmanagement.repository.AlertRepository;
import com.tcp.cleanmanagement.repository.SensorDataRawRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.math.BigDecimal;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalyticsService {
    private final SensorDataRawRepository dataRepository;
    private final AlertRepository alertRepository;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handleSensorDataSaved(SensorDataSavedEvent event) {
        SensorDataRaw currentData = dataRepository.findById(event.getDataId()).orElse(null);
        if (currentData == null) return;
        SensorMetric metric = currentData.getMetric();
        Sensor sensor = metric.getSensor();
        // Async processing may run after an installation has moved. Use the
        // configuration recorded when this reading was accepted.
        Zone zone = currentData.getDeviceSetHistory() == null ? sensor.getZone()
                : currentData.getDeviceSetHistory().getZone();

        if (zone == null) return;

        if (metric.getMetricCode() == MetricCode.GAS) {
            analyzeGasData(currentData, metric, sensor, zone);
        } else if (metric.getMetricCode() == MetricCode.TEMPERATURE) {
            analyzeTempHumidData(currentData, sensor, zone);
        }
    }

    private void analyzeGasData(SensorDataRaw currentData, SensorMetric metric, Sensor sensor, Zone zone) {
        if ("UNVERIFIED".equals(metric.getUnitCode()) || metric.getPleasantThreshold() == null) return;
        BigDecimal currentValue = currentData.getMeasuredValue();
        BigDecimal threshold = metric.getPleasantThreshold().multiply(new BigDecimal("1.5"));

        if (currentValue.compareTo(threshold) > 0) {
            log.info("Smoking anomaly detected in Zone: {}", zone.getName());
            createAlert(zone, sensor, currentData.getDeviceSetHistory(), AlertType.SMOKING,
                    "유해가스 농도 급상승 감지 (흡연/역류 의심). 수치: " + currentValue);
        }
    }

    private void analyzeTempHumidData(SensorDataRaw currentData, Sensor sensor, Zone zone) {
        BigDecimal currentTemp = currentData.getMeasuredValue();

        if (currentTemp.compareTo(BigDecimal.ZERO) < 0) {
            log.info("Freeze risk detected in Zone: {}", zone.getName());
            createAlert(zone, sensor, currentData.getDeviceSetHistory(), AlertType.FREEZE,
                    "온도 영하 하락 (동파 위험). 현재 온도: " + currentTemp + "°C");
        }
    }

    private void createAlert(Zone zone, Sensor sensor, DeviceSetHistory history, AlertType type, String message) {
        Alert alert = Alert.builder()
                .zone(zone)
                .sensor(sensor)
                .deviceSetHistory(history)
                .alertType(type)
                .message(message)
                .status(AlertStatus.UNRESOLVED)
                .build();
        alertRepository.save(alert);
    }
}
