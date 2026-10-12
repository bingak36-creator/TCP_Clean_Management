package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.enums.MetricCode;
import com.tcp.cleanmanagement.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import java.time.OffsetDateTime;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class UpstashImportServiceTest {
    @Autowired UpstashImportService service;
    @Autowired UpstashImportedSampleRepository sampleRepository;
    @Autowired UpstashDeviceRepository deviceRepository;
    @Autowired SensorDataRawRepository rawRepository;
    @Autowired IotDataService iotDataService;

    @Test
    void registersDeviceImportsAllMetricsAndDeduplicatesAfterReload() {
        String mac = "AA:BB:CC:DD:EE:01";
        String payload = payload(mac, true, "45", "293");
        double score = OffsetDateTime.parse("2026-10-12T05:30:17Z").toEpochSecond();
        assertEquals(0, service.checkpoint(mac));
        long before = rawRepository.count();

        assertTrue(service.importSample(mac, score, payload));
        assertEquals(before + 3, rawRepository.count());
        assertEquals(payload, sampleRepository.findByMacAddressAndSampleKey(mac, key(payload)).orElseThrow().getPayload());
        assertEquals(score, service.checkpoint(mac));
        assertFalse(service.importSample(mac, score, payload));
        assertEquals(before + 3, rawRepository.count());
        var device = deviceRepository.findById(mac).orElseThrow();
        var config = iotDataService.getDeviceSetByMac(mac.toLowerCase());
        assertEquals(device.getTemperatureHumiditySensor().getId(), config.getSensorIds().get("DHT11"));
        assertEquals(device.getGasSensor().getId(), config.getSensorIds().get("MQ135"));
    }

    @Test
    void dhtFailurePreservesRawPayloadAndOnlySavesGas() {
        String mac = "AA:BB:CC:DD:EE:02";
        String payload = payload(mac, false, "null", "301");
        long before = rawRepository.count();
        assertTrue(service.importSample(mac, 1791783017, payload));
        assertEquals(before + 1, rawRepository.count());
        assertTrue(sampleRepository.findByMacAddressAndSampleKey(mac, key(payload)).isPresent());
    }

    @Test
    void failedPacketDoesNotAdvanceCheckpointOrPartiallyPersistMetrics() {
        String mac = "AA:BB:CC:DD:EE:03";
        service.checkpoint(mac);
        long before = rawRepository.count();
        String payload = payload(mac, true, "101", "293");
        assertThrows(RuntimeException.class, () -> service.importSample(mac, 1791783017, payload));
        assertEquals(before, rawRepository.count());
        assertEquals(0, service.checkpoint(mac));
        assertTrue(sampleRepository.findByMacAddressAndSampleKey(mac, key(payload)).isEmpty());
    }

    @Test
    void mismatchedIdentityAndConflictingRetriesAreRejected() {
        String mac = "AA:BB:CC:DD:EE:04";
        String payload = payload(mac, true, "45", "293");
        assertThrows(IllegalArgumentException.class,
                () -> service.importSample("AA:BB:CC:DD:EE:05", 1791783017, payload));
        assertTrue(service.importSample(mac, 1791783017, payload));
        assertThrows(IllegalArgumentException.class,
                () -> service.importSample(mac, 1791783017, payload.replace("293", "294")));
    }

    private String payload(String mac, boolean dhtOk, String humidity, String gas) {
        return "{\"source\":\"esp32_direct\",\"mac_address\":\"" + mac
                + "\",\"sample_key\":\"" + UUID.randomUUID()
                + "\",\"measured_at\":\"2026-10-12T05:30:17Z\",\"dht_ok\":" + dhtOk
                + ",\"temperature_c\":" + (dhtOk ? "28" : "null")
                + ",\"humidity_percent\":" + humidity + ",\"mq135_adc\":" + gas + "}";
    }

    private String key(String payload) {
        int start = payload.indexOf("\"sample_key\":\"") + "\"sample_key\":\"".length();
        return payload.substring(start, payload.indexOf('"', start));
    }
}
