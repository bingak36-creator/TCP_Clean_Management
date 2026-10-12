package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.DeviceSetResponse;
import com.tcp.cleanmanagement.dto.SensorDataRequest;
import com.tcp.cleanmanagement.entity.Sensor;
import com.tcp.cleanmanagement.entity.SensorDataRaw;
import com.tcp.cleanmanagement.event.SensorDataSavedEvent;
import com.tcp.cleanmanagement.repository.SensorRepository;
import com.tcp.cleanmanagement.repository.SensorDataRawRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class IotDataService {
    private final SensorRepository sensorRepository;
    private final SensorDataRawRepository dataRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional(readOnly = true)
    public DeviceSetResponse getDeviceSetByMac(String mac) {
        // ESP32 MAC 주소 기반 센서 ID 매핑 반환
        Map<String, Long> sensorMap = new HashMap<>();
        sensorMap.put("DHT11", 1L); // 온습도 센서 ID
        sensorMap.put("MQ135", 2L); // 공기질/가스 센서 ID
        sensorMap.put("MQ7", 3L);   // 일산화탄소 센서 ID

        return DeviceSetResponse.builder()
                .macAddress(mac)
                .setCode("ESP32_SET_01")
                .sensorIds(sensorMap)
                .build();
    }

    @Transactional
    public void saveSensorData(Long sensorId, SensorDataRequest request) {
        Sensor sensor = sensorRepository.findById(sensorId)
                .orElseGet(() -> {
                    // ID가 존재하지 않으면 1번 기본 센서로 fallback
                    return sensorRepository.findAll().stream().findFirst()
                            .orElseThrow(() -> new IllegalArgumentException("No sensor available in DB"));
                });

        Float val1 = request.getValue1();
        Float val2 = request.getValue2();

        // ESP32 배열 형태의 readings 파싱 지원
        if (request.getReadings() != null && !request.getReadings().isEmpty()) {
            for (SensorDataRequest.MetricReading r : request.getReadings()) {
                if (r.getMetricCode() != null && r.getMeasuredValue() != null) {
                    if ("TEMPERATURE".equalsIgnoreCase(r.getMetricCode())) {
                        val1 = r.getMeasuredValue();
                    } else if ("HUMIDITY".equalsIgnoreCase(r.getMetricCode())) {
                        val2 = r.getMeasuredValue();
                    } else if ("GAS".equalsIgnoreCase(r.getMetricCode())) {
                        val1 = r.getMeasuredValue();
                    }
                }
            }
        }

        SensorDataRaw rawData = SensorDataRaw.builder()
                .sensor(sensor)
                .value1(val1 != null ? val1 : 0.0f)
                .value2(val2 != null ? val2 : 0.0f)
                .measuredAt(LocalDateTime.now())
                .build();

        SensorDataRaw savedData = dataRepository.save(rawData);
        
        // Publish event for async analysis
        eventPublisher.publishEvent(new SensorDataSavedEvent(savedData));
    }
}
