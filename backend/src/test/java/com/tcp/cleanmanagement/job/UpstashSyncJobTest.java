package com.tcp.cleanmanagement.job;

import com.tcp.cleanmanagement.config.UpstashSyncProperties;
import com.tcp.cleanmanagement.service.UpstashHistoryReader;
import com.tcp.cleanmanagement.service.UpstashImportService;
import io.lettuce.core.ScoredValue;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Set;
import static org.mockito.Mockito.*;

class UpstashSyncJobTest {
    @Test
    void pagesFromInclusiveCheckpointWithoutSkippingEqualScores() {
        var properties = new UpstashSyncProperties();
        properties.setRedisUrl("rediss://example.upstash.io:6379");
        properties.setBatchSize(2);
        var reader = mock(UpstashHistoryReader.class);
        var importer = mock(UpstashImportService.class);
        var job = new UpstashSyncJob(properties, reader, importer);
        String mac = "AA:BB:CC:DD:EE:FF";
        when(reader.discoverDevices()).thenReturn(Set.of(mac));
        when(importer.checkpoint(mac)).thenReturn(100.0);
        when(reader.readPage(mac, 100.0, 0)).thenReturn(List.of(ScoredValue.just(100, "a"), ScoredValue.just(100, "b")));
        when(reader.readPage(mac, 100.0, 2)).thenReturn(List.of(ScoredValue.just(101, "c")));
        when(reader.readPage(mac, 100.0, 3)).thenReturn(List.of());
        job.sync();
        verify(importer).importSample(mac, 100, "a");
        verify(importer).importSample(mac, 100, "b");
        verify(importer).importSample(mac, 101, "c");
    }

    @Test
    void leavesLaterPacketsForRetryWhenOnePacketFails() {
        var properties = new UpstashSyncProperties();
        properties.setRedisUrl("rediss://example.upstash.io:6379");
        var reader = mock(UpstashHistoryReader.class);
        var importer = mock(UpstashImportService.class);
        var job = new UpstashSyncJob(properties, reader, importer);
        String mac = "AA:BB:CC:DD:EE:FF";
        when(reader.discoverDevices()).thenReturn(Set.of(mac));
        when(reader.readPage(mac, 0, 0)).thenReturn(List.of(ScoredValue.just(1, "bad"), ScoredValue.just(2, "next")));
        when(importer.importSample(mac, 1, "bad")).thenThrow(new IllegalStateException("database unavailable"));
        job.sync();
        verify(importer, never()).importSample(mac, 2, "next");
        verify(importer, never()).skipRejectedSample(anyString(), anyDouble());
    }

    @Test
    void skipsRejectedPacketAndKeepsImportingLaterPackets() {
        var properties = new UpstashSyncProperties();
        properties.setRedisUrl("rediss://example.upstash.io:6379");
        var reader = mock(UpstashHistoryReader.class);
        var importer = mock(UpstashImportService.class);
        var job = new UpstashSyncJob(properties, reader, importer);
        String mac = "AA:BB:CC:DD:EE:FF";
        when(reader.discoverDevices()).thenReturn(Set.of(mac));
        when(reader.readPage(mac, 0, 0)).thenReturn(List.of(ScoredValue.just(1, "bad"), ScoredValue.just(2, "next")));
        when(importer.importSample(mac, 1, "bad")).thenThrow(new IllegalArgumentException("Invalid MQ135 ADC value"));
        when(importer.importSample(mac, 2, "next")).thenReturn(true);
        job.sync();
        verify(importer).skipRejectedSample(mac, 1);
        verify(importer).importSample(mac, 2, "next");
        org.junit.jupiter.api.Assertions.assertNull(job.getLastError());
    }

    @Test
    void doesNotConnectUntilUrlIsConfigured() {
        var reader = mock(UpstashHistoryReader.class);
        var importer = mock(UpstashImportService.class);
        new UpstashSyncJob(new UpstashSyncProperties(), reader, importer).sync();
        verifyNoInteractions(reader, importer);
    }

    @Test
    void disabledSyncDoesNotQueryUpstashEvenWithConfiguredUrl() {
        var properties = new UpstashSyncProperties();
        properties.setRedisUrl("rediss://example.upstash.io:6379");
        properties.setEnabled(false);
        var reader = mock(UpstashHistoryReader.class);
        var importer = mock(UpstashImportService.class);
        new UpstashSyncJob(properties, reader, importer).sync();
        verifyNoInteractions(reader, importer);
    }
}
