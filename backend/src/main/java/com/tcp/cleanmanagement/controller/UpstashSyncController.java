package com.tcp.cleanmanagement.controller;

import com.tcp.cleanmanagement.config.UpstashSyncProperties;
import com.tcp.cleanmanagement.job.UpstashSyncJob;
import com.tcp.cleanmanagement.repository.UpstashDeviceRepository;
import com.tcp.cleanmanagement.repository.UpstashImportedSampleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/iot/upstash")
@RequiredArgsConstructor
public class UpstashSyncController {
    private final UpstashSyncProperties properties;
    private final com.tcp.cleanmanagement.security.AccessService access;
    private final UpstashSyncJob job;
    private final UpstashDeviceRepository deviceRepository;
    private final UpstashImportedSampleRepository sampleRepository;

    @GetMapping("/status")
    @Transactional(readOnly = true)
    public Status status() {
        access.requireDeveloper();
        List<Device> devices = deviceRepository.findAll().stream()
                .map(d -> new Device(d.getMacAddress(), d.getZone().getId(),
                        d.getTemperatureHumiditySensor().getId(), d.getGasSensor().getId(),
                        Instant.ofEpochSecond((long) d.getLastScore())))
                .toList();
        return new Status(properties.getRedisUrl() != null && !properties.getRedisUrl().isBlank(),
                properties.isEnabled(), sampleRepository.count(), devices, job.getLastAttempt(), job.getLastSuccess(), job.getLastError());
    }

    public record Device(String macAddress, Long zoneId, Long temperatureHumiditySensorId,
                         Long gasSensorId, Instant lastMeasuredAt) {}
    public record Status(boolean configured, boolean enabled, long importedSamples, List<Device> devices,
                         Instant lastAttempt, Instant lastSuccess, String lastError) {}
}
