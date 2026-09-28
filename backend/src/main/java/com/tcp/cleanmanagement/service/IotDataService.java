package com.tcp.cleanmanagement.service;

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

@Service
@RequiredArgsConstructor
public class IotDataService {
    private final SensorRepository sensorRepository;
    private final SensorDataRawRepository dataRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public void saveSensorData(Long sensorId, SensorDataRequest request) {
        Sensor sensor = sensorRepository.findById(sensorId)
                .orElseThrow(() -> new IllegalArgumentException("Invalid sensor ID: " + sensorId));

        SensorDataRaw rawData = SensorDataRaw.builder()
                .sensor(sensor)
                .value1(request.getValue1())
                .value2(request.getValue2())
                .measuredAt(LocalDateTime.now())
                .build();

        SensorDataRaw savedData = dataRepository.save(rawData);
        
        // Publish event for async analysis
        eventPublisher.publishEvent(new SensorDataSavedEvent(savedData));
    }
}
