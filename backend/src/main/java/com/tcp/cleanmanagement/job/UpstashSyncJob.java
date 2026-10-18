package com.tcp.cleanmanagement.job;

import com.tcp.cleanmanagement.config.UpstashSyncProperties;
import com.tcp.cleanmanagement.service.UpstashHistoryReader;
import com.tcp.cleanmanagement.service.UpstashImportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.time.Instant;
import lombok.Getter;

@Slf4j
@Component
@RequiredArgsConstructor
public class UpstashSyncJob {
    private final UpstashSyncProperties properties;
    private final UpstashHistoryReader historyReader;
    private final UpstashImportService importService;
    private Set<String> devices;
    private long nextDiscovery;
    @Getter private volatile Instant lastAttempt;
    @Getter private volatile Instant lastSuccess;
    @Getter private volatile String lastError;

    @Scheduled(fixedDelayString = "${iot.upstash.poll-interval-ms:120000}", initialDelay = 10000)
    public synchronized void sync() {
        if (!properties.isEnabled() || properties.getRedisUrl() == null || properties.getRedisUrl().isBlank()) return;
        lastAttempt = Instant.now();
        lastError = null;
        try {
            if (devices == null || System.nanoTime() >= nextDiscovery) {
                devices = historyReader.discoverDevices();
                nextDiscovery = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(
                        Math.max(1000, properties.getDiscoveryIntervalMs()));
            }
            for (String mac : devices) {
                try {
                    double startScore = importService.checkpoint(mac);
                    long offset = 0;
                    int imported = 0;
                    while (true) {
                        var page = historyReader.readPage(mac, startScore, offset);
                        if (page.isEmpty()) break;
                        for (var item : page) {
                            try {
                                if (importService.importSample(mac, item.getScore(), item.getValue())) imported++;
                            } catch (RuntimeException error) {
                                // Transient failures stop here and retry; a rejected packet would block the device forever.
                                if (!UpstashImportService.isRejectedPacket(error)) throw error;
                                importService.skipRejectedSample(mac, item.getScore());
                                log.warn("Upstash packet for {} at score {} rejected and skipped ({})",
                                        mac, (long) item.getScore(), error.getClass().getSimpleName());
                            }
                        }
                        offset += page.size();
                        if (page.size() < Math.max(1, Math.min(properties.getBatchSize(), 1000))) break;
                    }
                    if (imported > 0) log.info("Imported {} Upstash samples for {} into MySQL", imported, mac);
                } catch (RuntimeException error) {
                    lastError = error.getClass().getSimpleName();
                    // Never log a connection URI, Redis response, token or payload.
                    log.warn("Upstash device {} import paused; retrying next poll ({})", mac, error.getClass().getSimpleName());
                }
            }
            if (lastError == null) lastSuccess = Instant.now();
        } catch (RuntimeException error) {
            lastError = error.getClass().getSimpleName();
            log.warn("Upstash connection unavailable; retrying next poll ({})", error.getClass().getSimpleName());
        }
    }
}
