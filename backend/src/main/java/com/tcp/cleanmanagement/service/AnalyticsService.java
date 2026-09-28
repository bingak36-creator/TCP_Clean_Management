package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.entity.Alert;
import com.tcp.cleanmanagement.entity.Sensor;
import com.tcp.cleanmanagement.entity.SensorDataRaw;
import com.tcp.cleanmanagement.entity.Zone;
import com.tcp.cleanmanagement.enums.AlertStatus;
import com.tcp.cleanmanagement.enums.AlertType;
import com.tcp.cleanmanagement.enums.SensorType;
import com.tcp.cleanmanagement.event.SensorDataSavedEvent;
import com.tcp.cleanmanagement.repository.AlertRepository;
import com.tcp.cleanmanagement.repository.SensorDataRawRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalyticsService {
    private final SensorDataRawRepository dataRepository;
    private final AlertRepository alertRepository;

    @Async
    @EventListener
    @Transactional
    public void handleSensorDataSaved(SensorDataSavedEvent event) {
        SensorDataRaw currentData = event.getData();
        Sensor sensor = currentData.getSensor();
        Zone zone = sensor.getZone();

        if (zone == null) return;

        LocalDateTime fiveMinsAgo = LocalDateTime.now().minusMinutes(5);
        List<SensorDataRaw> recentData = dataRepository.findRecentDataBySensorId(sensor.getId(), fiveMinsAgo);

        // Analyze based on sensor type
        if (sensor.getSensorType() == SensorType.GAS) {
            analyzeGasData(currentData, recentData, zone);
        } else if (sensor.getSensorType() == SensorType.TEMP_HUMID) {
            analyzeTempHumidData(currentData, zone);
        }
    }

    private void analyzeGasData(SensorDataRaw currentData, List<SensorDataRaw> recentData, Zone zone) {
        // Simple logic: if gas level exceeds pleasantThreshold by a lot, consider it smoking
        Float threshold = zone.getPleasantThreshold() != null ? zone.getPleasantThreshold() : 50.0f; // default 50
        Float currentValue = currentData.getValue1(); // Assuming value1 is Gas concentration

        if (currentValue != null && currentValue > (threshold * 1.5)) { // 1.5x threshold pattern for smoking
            log.info("Smoking anomaly detected in Zone: {}", zone.getName());
            createAlert(zone, AlertType.SMOKING, "유해가스 농도 급상승 감지 (흡연/역류 의심). 수치: " + currentValue);
        }
    }

    private void analyzeTempHumidData(SensorDataRaw currentData, Zone zone) {
        Float currentTemp = currentData.getValue1(); // Assuming value1 is Temperature

        if (currentTemp != null && currentTemp < 0.0) { // Freeze risk if below 0 degrees
            log.info("Freeze risk detected in Zone: {}", zone.getName());
            createAlert(zone, AlertType.FREEZE, "온도 영하 하락 (동파 위험). 현재 온도: " + currentTemp + "°C");
        }
    }

    private void createAlert(Zone zone, AlertType type, String message) {
        Alert alert = Alert.builder()
                .zone(zone)
                .alertType(type)
                .message(message)
                .status(AlertStatus.UNRESOLVED)
                .build();
        alertRepository.save(alert);
    }
}
