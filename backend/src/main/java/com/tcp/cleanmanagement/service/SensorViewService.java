package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.UpstashSample;
import com.tcp.cleanmanagement.entity.UpstashDevice;
import com.tcp.cleanmanagement.repository.UpstashDeviceRepository;
import com.tcp.cleanmanagement.repository.UpstashImportedSampleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

@Service
@RequiredArgsConstructor
public class SensorViewService {
    private final UpstashDeviceRepository devices;
    private final UpstashImportedSampleRepository samples;
    private final JsonMapper mapper;

    @Transactional(readOnly = true)
    public List<Snapshot> snapshots(String source) {
        validateSource(source);
        return devices.findAll().stream().map(device -> {
            var stored = samples.findFirstByMacAddressOrderByMeasuredAtDescIdDesc(device.getMacAddress());
            String payload = stored.map(s -> s.getPayload()).orElse(null);
            Instant importedAt = stored.map(s -> s.getImportedAt().toInstant(ZoneOffset.UTC)).orElse(null);
            Point point = payload == null ? null : point(device.getMacAddress(), payload);
            return snapshot(device, point, importedAt, source, stored.map(s -> s.getIngestSource()).orElse(null));
        }).sorted(Comparator.comparing(Snapshot::macAddress)).toList();
    }

    @Transactional(readOnly = true)
    public List<Point> history(String mac, String source, int hours, int limit) {
        validateSource(source);
        mac = mac.toUpperCase(Locale.ROOT);
        if (!mac.matches("([0-9A-F]{2}:){5}[0-9A-F]{2}") || hours < 1 || hours > 168 || limit < 1 || limit > 1000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid history parameters");
        }
        if (!devices.existsById(mac)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Device not found");
        Instant from = Instant.now().minus(Duration.ofHours(hours));
        List<Point> points = new ArrayList<>();
        for (var row : samples.findByMacAddressAndMeasuredAtGreaterThanEqualOrderByMeasuredAtDescIdDesc(
                mac, LocalDateTime.ofInstant(from, ZoneOffset.UTC), PageRequest.of(0, limit))) {
            points.add(point(mac, row.getPayload()));
        }
        points.sort(Comparator.comparing(Point::measuredAt).thenComparing(Point::sampleKey));
        return points;
    }

    private Point point(String mac, String payload) {
        UpstashSample sample = mapper.readValue(payload, UpstashSample.class);
        if (!"esp32_direct".equals(sample.source()) || !mac.equalsIgnoreCase(sample.macAddress())) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unexpected device data");
        }
        boolean dhtOk = Boolean.TRUE.equals(sample.dhtOk());
        return new Point(sample.sampleKey(), OffsetDateTime.parse(sample.measuredAt()).toInstant(),
                dhtOk ? sample.temperatureC() : null, dhtOk ? sample.humidityPercent() : null,
                sample.mq135Adc(), sample.mq7Adc());
    }

    private Snapshot snapshot(UpstashDevice device, Point point, Instant importedAt, String source, String ingestSource) {
        var zone = device.getZone();
        Instant measuredAt = point == null ? null : point.measuredAt();
        boolean stale = measuredAt == null || measuredAt.isBefore(Instant.now().minus(Duration.ofMinutes(5)));
        return new Snapshot(zone.getId(), device.getMacAddress(), zone.getName(), zone.getLatitude(), zone.getLongitude(),
                point == null ? null : point.temperatureC(), point == null ? null : point.humidityPercent(),
                point == null ? null : point.mq135Adc(), point == null ? null : point.mq7Adc(),
                measuredAt, importedAt, source, ingestSource, stale);
    }

    private void validateSource(String source) {
        if (!"mysql".equals(source)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only MySQL data access is supported");
        }
    }

    public record Point(String sampleKey, Instant measuredAt, BigDecimal temperatureC,
                        BigDecimal humidityPercent, BigDecimal mq135Adc, BigDecimal mq7Adc) {
        public Point(String sampleKey, Instant measuredAt, BigDecimal temperatureC,
                     BigDecimal humidityPercent, BigDecimal mq135Adc) {
            this(sampleKey, measuredAt, temperatureC, humidityPercent, mq135Adc, null);
        }
    }
    public record Snapshot(Long zoneId, String macAddress, String name, Double latitude, Double longitude,
                           BigDecimal temperatureC, BigDecimal humidityPercent, BigDecimal mq135Adc, BigDecimal mq7Adc,
                           Instant measuredAt, Instant importedAt, String source, String ingestSource, boolean stale) {
        public Snapshot(Long zoneId, String macAddress, String name, Double latitude, Double longitude,
                        BigDecimal temperatureC, BigDecimal humidityPercent, BigDecimal mq135Adc,
                        Instant measuredAt, Instant importedAt, String source, String ingestSource, boolean stale) {
            this(zoneId, macAddress, name, latitude, longitude, temperatureC, humidityPercent, mq135Adc, null,
                 measuredAt, importedAt, source, ingestSource, stale);
        }
    }
}
