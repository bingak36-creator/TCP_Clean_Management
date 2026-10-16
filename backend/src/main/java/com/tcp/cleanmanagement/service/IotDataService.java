package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.DeviceSetResponse;
import com.tcp.cleanmanagement.dto.SensorDataRequest;
import com.tcp.cleanmanagement.entity.DeviceSet;
import com.tcp.cleanmanagement.entity.Sensor;
import com.tcp.cleanmanagement.entity.SensorDataRaw;
import com.tcp.cleanmanagement.entity.SensorMetric;
import com.tcp.cleanmanagement.entity.DeviceSetHistory;
import com.tcp.cleanmanagement.enums.MetricCode;
import com.tcp.cleanmanagement.enums.SensorModel;
import com.tcp.cleanmanagement.enums.SensorStatus;
import com.tcp.cleanmanagement.enums.SensorType;
import com.tcp.cleanmanagement.enums.TimeSource;
import com.tcp.cleanmanagement.event.SensorDataSavedEvent;
import com.tcp.cleanmanagement.repository.DeviceSetRepository;
import com.tcp.cleanmanagement.repository.SensorRepository;
import com.tcp.cleanmanagement.repository.SensorDataRawRepository;
import com.tcp.cleanmanagement.repository.SensorMetricRepository;
import com.tcp.cleanmanagement.repository.DeviceSetHistoryRepository;
import com.tcp.cleanmanagement.repository.UpstashDeviceRepository;
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
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class IotDataService {
    private final SensorRepository sensorRepository;
    private final SensorMetricRepository metricRepository;
    private final SensorDataRawRepository dataRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final UpstashDeviceRepository upstashDeviceRepository;
    private final DeviceSetHistoryRepository historyRepository;
    private final DeviceSetRepository deviceSetRepository;

    @Transactional(readOnly = true)
    public DeviceSetResponse getDeviceSetByMac(String mac) {
        String normalizedMac = (mac != null && mac.matches("[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}"))
                ? mac.toUpperCase(Locale.ROOT) : (mac != null ? mac.trim() : "");
        if (!normalizedMac.isEmpty() && deviceSetRepository != null) {
            Optional<DeviceSet> registeredSet = deviceSetRepository.findByMacAddress(normalizedMac);
            if (registeredSet.isPresent()) {
                DeviceSet set = registeredSet.get();
                Map<String, Long> ids = new HashMap<>();
                int gasCount = 0;
                for (Sensor sensor : sensorRepository.findByDeviceSetIdOrderByIdAsc(set.getId())) {
                    if (sensor.getSensorModel() != null) {
                        ids.put(sensor.getSensorModel().name(), sensor.getId());
                        if (sensor.getSensorModel() == SensorModel.DHT22) {
                            ids.put("DHT11", sensor.getId());
                        }
                    } else if (sensor.getSensorType() == SensorType.TEMP_HUMID) {
                        ids.put("DHT11", sensor.getId());
                        ids.put("DHT22", sensor.getId());
                    } else if (sensor.getSensorType() == SensorType.GAS) {
                        if (gasCount == 0) {
                            ids.put("MQ135", sensor.getId());
                        } else {
                            ids.put("MQ7", sensor.getId());
                        }
                        gasCount++;
                    }
                }
                return DeviceSetResponse.builder()
                        .deviceSetId(set.getId())
                        .setCode(set.getSetCode())
                        .macAddress(set.getMacAddress())
                        .zoneId(set.getZone() != null ? set.getZone().getId() : null)
                        .zoneName(set.getZone() != null ? set.getZone().getName() : null)
                        .installationLabel(set.getInstallationLabel())
                        .sensorIds(ids)
                        .build();
            }

            var registered = upstashDeviceRepository.findById(normalizedMac);
            if (registered.isPresent()) {
                var device = registered.get();
                Map<String, Long> ids = new HashMap<>();
                ids.put("DHT11", device.getTemperatureHumiditySensor().getId());
                ids.put("DHT22", device.getTemperatureHumiditySensor().getId());
                ids.put("MQ135", device.getGasSensor().getId());
                return DeviceSetResponse.builder().macAddress(device.getMacAddress())
                        .setCode("ESP32_" + device.getMacAddress().replace(":", ""))
                        .sensorIds(ids).build();
            }
        }
        // The upstream demo uses one shared device set; resolve IDs by type so
        // databases migrated from the metric-based schema remain compatible.
        List<Sensor> sensors = sensorRepository.findAll().stream()
                .filter(sensor -> sensor.getStatus() == SensorStatus.ACTIVE)
                .sorted(Comparator.comparing(Sensor::getId))
                .toList();
        Map<String, Long> sensorMap = new HashMap<>();
        sensors.stream().filter(sensor -> sensor.getSensorType() == SensorType.TEMP_HUMID)
                .findFirst().ifPresent(sensor -> {
                    sensorMap.put("DHT11", sensor.getId());
                    sensorMap.put("DHT22", sensor.getId());
                });
        List<Sensor> gasSensors = sensors.stream()
                .filter(sensor -> sensor.getSensorType() == SensorType.GAS).limit(2).toList();
        if (!gasSensors.isEmpty()) sensorMap.put("MQ135", gasSensors.get(0).getId());
        if (gasSensors.size() > 1) sensorMap.put("MQ7", gasSensors.get(1).getId());

        return DeviceSetResponse.builder()
                .macAddress(mac)
                .setCode("ESP32_SET_01")
                .sensorIds(sensorMap)
                .build();
    }

    @Transactional
    public void saveSensorData(Long sensorId, SensorDataRequest request) {
        Sensor sensor = sensorRepository.findByIdForUpdate(sensorId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sensor not found"));
        if (request == null || request.getSampleKey() == null || request.getReadings() == null
                || request.getReadings().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A sample key and readings are required");
        }
        if (sensor.getDeviceSet() != null) {
            String mac = request.getMacAddress();
            // Existing ESP32 sketches put their station MAC at the start of sampleKey.
            if (mac == null && request.getSampleKey().matches("[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}:.+")) {
                mac = request.getSampleKey().substring(0, 17);
            }
            if (mac == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ESP32 MAC address is required for this set");
            }
            if (!sensor.getDeviceSet().getMacAddress().equalsIgnoreCase(mac)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Sensor belongs to another ESP32 set");
            }
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
        DeviceSetHistory history = sensor.getDeviceSet() == null ? null : historyRepository
                .findFirstByDeviceSetIdOrderByIdDesc(sensor.getDeviceSet().getId()).orElse(null);

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
                    .deviceSetHistory(history)
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
