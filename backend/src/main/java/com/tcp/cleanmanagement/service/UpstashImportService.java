package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.SensorDataRequest;
import com.tcp.cleanmanagement.dto.UpstashSample;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.enums.*;
import com.tcp.cleanmanagement.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.time.*;
import java.util.List;

@Service
@RequiredArgsConstructor
public class UpstashImportService {
    private final UpstashDeviceRepository deviceRepository;
    private final UpstashImportedSampleRepository sampleRepository;
    private final ZoneRepository zoneRepository;
    private final SensorRepository sensorRepository;
    private final IotDataService iotDataService;
    private final JsonMapper jsonMapper;

    @Transactional
    public double checkpoint(String mac) {
        return device(mac).getLastScore();
    }

    private UpstashDevice device(String mac) {
        return deviceRepository.findLockedByMac(mac).orElseGet(() -> {
            Zone zone = zoneRepository.save(Zone.builder().name("ESP32 " + mac)
                    .zoneType(ZoneType.TOILET).isOurSolution(true).build());
            Sensor temperature = sensorRepository.save(Sensor.builder().zone(zone)
                    .sensorType(SensorType.TEMP_HUMID).status(SensorStatus.ACTIVE).build());
            Sensor gas = sensorRepository.save(Sensor.builder().zone(zone)
                    .sensorType(SensorType.GAS).status(SensorStatus.ACTIVE).build());
            return deviceRepository.save(UpstashDevice.builder().macAddress(mac).zone(zone)
                    .temperatureHumiditySensor(temperature).gasSensor(gas).build());
        });
    }

    @Transactional
    public boolean importSample(String mac, double score, String payload) {
        return saveSample(mac, score, payload, "upstash", true);
    }

    /** Direct API ingestion shares the archive but must not move the Redis checkpoint. */
    @Transactional
    public boolean receiveDirectSample(String payload) {
        UpstashSample sample = jsonMapper.readValue(payload, UpstashSample.class);
        String mac = sample.macAddress() == null ? "" : sample.macAddress().toUpperCase(java.util.Locale.ROOT);
        if (!mac.matches("([0-9A-F]{2}:){5}[0-9A-F]{2}")) throw new IllegalArgumentException("Invalid MAC address");
        double score = OffsetDateTime.parse(sample.measuredAt()).toEpochSecond();
        return saveSample(mac, score, payload, "direct_api", false);
    }

    private boolean saveSample(String mac, double score, String payload, String source, boolean advanceCheckpoint) {
        UpstashSample sample = jsonMapper.readValue(payload, UpstashSample.class);
        if (!"esp32_direct".equals(sample.source()) || !mac.equalsIgnoreCase(sample.macAddress())
                || sample.sampleKey() == null || !sample.sampleKey().matches("[A-Za-z0-9._:-]{1,64}")) {
            throw new IllegalArgumentException("Unexpected ESP32 sample identity");
        }
        OffsetDateTime measuredAt = OffsetDateTime.parse(sample.measuredAt());
        if (!Double.isFinite(score) || score != measuredAt.toEpochSecond()) {
            throw new IllegalArgumentException("Sample time does not match history score");
        }
        requireValue(sample.mq135Adc());
        if (sample.mq135Adc().signum() < 0 || sample.mq135Adc().compareTo(BigDecimal.valueOf(4095)) > 0) {
            throw new IllegalArgumentException("Invalid MQ135 ADC value");
        }
        if (Boolean.TRUE.equals(sample.dhtOk())) {
            requireValue(sample.temperatureC());
            requireValue(sample.humidityPercent());
        }

        UpstashDevice device = device(mac);
        var existing = sampleRepository.findByMacAddressAndSampleKey(mac, sample.sampleKey());
        if (existing.isPresent()) {
            if (!existing.get().getPayload().equals(payload)) {
                throw new IllegalArgumentException("Sample key has conflicting payloads");
            }
            if (advanceCheckpoint) device.setLastScore(Math.max(device.getLastScore(), score));
            return false;
        }

        if (Boolean.TRUE.equals(sample.dhtOk())) {
            iotDataService.saveSensorData(device.getTemperatureHumiditySensor().getId(),
                    request(sample, measuredAt, reading(MetricCode.TEMPERATURE, sample.temperatureC()),
                            reading(MetricCode.HUMIDITY, sample.humidityPercent())));
        }
        iotDataService.saveSensorData(device.getGasSensor().getId(),
                request(sample, measuredAt, reading(MetricCode.GAS, sample.mq135Adc())));
        sampleRepository.save(UpstashImportedSample.builder().macAddress(mac).sampleKey(sample.sampleKey())
                .payload(payload).ingestSource(source).measuredAt(measuredAt.withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime())
                .importedAt(LocalDateTime.now(ZoneOffset.UTC)).build());
        if (advanceCheckpoint) device.setLastScore(Math.max(device.getLastScore(), score));
        return true;
    }

    private void requireValue(BigDecimal value) {
        if (value == null || value.stripTrailingZeros().scale() > 6
                || value.abs().compareTo(new BigDecimal("1000000000000")) >= 0) {
            throw new IllegalArgumentException("Invalid sensor value");
        }
    }

    private SensorDataRequest request(UpstashSample sample, OffsetDateTime time,
                                      SensorDataRequest.Reading... readings) {
        SensorDataRequest request = new SensorDataRequest();
        request.setMacAddress(sample.macAddress());
        request.setSampleKey(sample.sampleKey());
        request.setMeasuredAt(time);
        request.setReadings(List.of(readings));
        return request;
    }

    private SensorDataRequest.Reading reading(MetricCode code, BigDecimal value) {
        SensorDataRequest.Reading reading = new SensorDataRequest.Reading();
        reading.setMetricCode(code);
        reading.setMeasuredValue(value);
        return reading;
    }
}
