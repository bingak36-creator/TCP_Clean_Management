package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import java.time.LocalDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SensorViewServiceTest {
    private final UpstashDeviceRepository devices = mock(UpstashDeviceRepository.class);
    private final UpstashImportedSampleRepository samples = mock(UpstashImportedSampleRepository.class);
    private final SensorViewService service = new SensorViewService(devices, samples, JsonMapper.builder().build());
    private final String mac = "AA:BB:CC:DD:EE:FF";

    @Test
    void mysqlModeReadsArchivedPayloadWithoutContactingUpstash() {
        when(devices.findAll()).thenReturn(List.of(device()));
        when(samples.findFirstByMacAddressOrderByMeasuredAtDescIdDesc(mac)).thenReturn(Optional.of(
                UpstashImportedSample.builder().payload(payload("one", "2026-10-12T05:55:46Z", true, 244))
                        .importedAt(LocalDateTime.of(2026, 10, 12, 6, 0)).build()));
        var result = service.snapshots("mysql").get(0);
        assertEquals("mysql", result.source());
        assertEquals(244, result.mq135Adc().intValue());
        assertEquals(24, result.temperatureC().intValue());
        assertNotNull(result.importedAt());
    }

    @Test
    void rejectsUpstashSourceBeforeAnyDatabaseRead() {
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> service.snapshots("upstash")).getStatusCode().value());
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> service.history(mac, "upstash", 1, 200)).getStatusCode().value());
        verifyNoInteractions(devices, samples);
    }

    @Test
    void missingDhtReadingRemainsMissingWhileZeroGasIsDisplayedFromMysql() {
        when(devices.findAll()).thenReturn(List.of(device()));
        when(samples.findFirstByMacAddressOrderByMeasuredAtDescIdDesc(mac)).thenReturn(Optional.of(
                UpstashImportedSample.builder().payload(payload("three", "2026-10-12T05:56:16Z", false, 0))
                        .importedAt(LocalDateTime.of(2026, 10, 12, 6, 0)).build()));
        var result = service.snapshots("mysql").get(0);
        assertNull(result.temperatureC());
        assertNull(result.humidityPercent());
        assertEquals(0, result.mq135Adc().intValue());
    }

    @Test
    void deviceWithNoImportedPacketHasNoInventedReading() {
        when(devices.findAll()).thenReturn(List.of(device()));
        when(samples.findFirstByMacAddressOrderByMeasuredAtDescIdDesc(mac)).thenReturn(Optional.empty());
        var result = service.snapshots("mysql").get(0);
        assertNull(result.measuredAt());
        assertNull(result.mq135Adc());
        assertTrue(result.stale());
    }

    @Test
    void historyIsChronologicalAndDoesNotBlendDeviceIdentities() {
        when(devices.existsById(mac)).thenReturn(true);
        when(samples.findByMacAddressAndMeasuredAtGreaterThanEqualOrderByMeasuredAtDescIdDesc(eq(mac), any(), any(Pageable.class)))
                .thenReturn(List.of(
                        UpstashImportedSample.builder().payload(payload("new", "2026-10-12T05:56:16Z", true, 300)).build(),
                        UpstashImportedSample.builder().payload(payload("old", "2026-10-12T05:55:46Z", true, 244)).build()));
        var points = service.history(mac.toLowerCase(), "mysql", 1, 200);
        assertEquals(List.of("old", "new"), points.stream().map(SensorViewService.Point::sampleKey).toList());
        when(samples.findFirstByMacAddressOrderByMeasuredAtDescIdDesc(mac)).thenReturn(Optional.of(
                UpstashImportedSample.builder().payload(payload("bad", "2026-10-12T05:55:46Z", true, 244)
                        .replace(mac, "00:00:00:00:00:00"))
                        .importedAt(LocalDateTime.of(2026, 10, 12, 6, 0)).build()));
        when(devices.findAll()).thenReturn(List.of(device()));
        assertEquals(502, assertThrows(ResponseStatusException.class, () -> service.snapshots("mysql")).getStatusCode().value());
    }

    @Test
    void rejectsUnknownSourcesAndUnboundedHistoryRequests() {
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> service.snapshots("other")).getStatusCode().value());
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> service.history(mac, "mysql", 1000, 1000)).getStatusCode().value());
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> service.history(mac, "mysql", 1, 1001)).getStatusCode().value());
        verifyNoInteractions(devices, samples);
    }

    private UpstashDevice device() {
        return UpstashDevice.builder().macAddress(mac).zone(Zone.builder().id(1L).name("ESP32 test").build()).build();
    }

    private String payload(String key, String time, boolean dhtOk, int gas) {
        return "{\"source\":\"esp32_direct\",\"mac_address\":\"" + mac + "\",\"sample_key\":\"" + key
                + "\",\"measured_at\":\"" + time + "\",\"dht_ok\":" + dhtOk
                + ",\"temperature_c\":24,\"humidity_percent\":62,\"mq135_adc\":" + gas + "}";
    }
}
