package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.SensorDataRequest;
import com.tcp.cleanmanagement.entity.Sensor;
import com.tcp.cleanmanagement.entity.SensorDataRaw;
import com.tcp.cleanmanagement.entity.SensorMetric;
import com.tcp.cleanmanagement.enums.MetricCode;
import com.tcp.cleanmanagement.enums.TimeSource;
import com.tcp.cleanmanagement.event.SensorDataSavedEvent;
import com.tcp.cleanmanagement.repository.SensorRepository;
import com.tcp.cleanmanagement.repository.SensorDataRawRepository;
import com.tcp.cleanmanagement.repository.SensorMetricRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class IotDataService {
    private final SensorRepository sensorRepository;
    private final SensorMetricRepository metricRepository;
    private final SensorDataRawRepository dataRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public void saveSensorData(Long sensorId, SensorDataRequest request) {
        Sensor sensor = sensorRepository.findByIdForUpdate(sensorId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sensor not found"));
        if (request == null || request.getSampleKey() == null || request.getReadings() == null
                || request.getReadings().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A sample key and readings are required");
        }

        Set<MetricCode> allowed = switch (sensor.getSensorType()) {
            case GAS -> Set.of(MetricCode.GAS);
            case TEMP_HUMID -> Set.of(MetricCode.TEMPERATURE, MetricCode.HUMIDITY);
            case MAG -> Set.of(MetricCode.CONTACT);
        };
        Set<MetricCode> seen = new HashSet<>();
        for (SensorDataRequest.Reading reading : request.getReadings()) {
            if (reading == null || reading.getMeasuredValue() == null || !allowed.contains(reading.getMetricCode())
                    || !seen.add(reading.getMetricCode())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid or duplicate metric for sensor type");
            }
            if (reading.getMetricCode() == MetricCode.HUMIDITY
                    && (reading.getMeasuredValue().signum() < 0
                    || reading.getMeasuredValue().compareTo(BigDecimal.valueOf(100)) > 0)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Humidity must be between 0 and 100");
            }
            if (reading.getMetricCode() == MetricCode.CONTACT
                    && !(reading.getMeasuredValue().compareTo(BigDecimal.ZERO) == 0
                    || reading.getMeasuredValue().compareTo(BigDecimal.ONE) == 0)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Contact must be 0 or 1");
            }
        }

        LocalDateTime receivedAt = LocalDateTime.now(ZoneOffset.UTC);
        LocalDateTime measuredAt = request.getMeasuredAt() == null
                ? receivedAt : request.getMeasuredAt().withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
        TimeSource timeSource = request.getMeasuredAt() == null ? TimeSource.SERVER : TimeSource.DEVICE;

        for (SensorDataRequest.Reading reading : request.getReadings()) {
            MetricCode code = reading.getMetricCode();
            SensorMetric metric = metricRepository.findBySensorIdAndMetricCode(sensorId, code)
                    .orElseGet(() -> metricRepository.save(SensorMetric.builder()
                            .sensor(sensor)
                            .metricCode(code)
                            .unitCode(unitFor(code))
                            .build()));

            var existing = dataRepository.findByMetricIdAndSampleKey(metric.getId(), request.getSampleKey());
            if (existing.isPresent()) {
                if (existing.get().getMeasuredValue().compareTo(reading.getMeasuredValue()) != 0
                        || (request.getMeasuredAt() != null && !existing.get().getMeasuredAt().equals(measuredAt))) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Sample key already has another value");
                }
                continue;
            }

            SensorDataRaw saved = dataRepository.save(SensorDataRaw.builder()
                    .metric(metric)
                    .sampleKey(request.getSampleKey())
                    .measuredValue(reading.getMeasuredValue())
                    .measuredAt(measuredAt)
                    .receivedAt(receivedAt)
                    .timeSource(timeSource)
                    .build());
            eventPublisher.publishEvent(new SensorDataSavedEvent(saved.getId()));
        }
    }

    private String unitFor(MetricCode code) {
        return switch (code) {
            case GAS -> "UNVERIFIED";
            case TEMPERATURE -> "CELSIUS";
            case HUMIDITY -> "PERCENT";
            case CONTACT -> "BINARY";
        };
    }
}
