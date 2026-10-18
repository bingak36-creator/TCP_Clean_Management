package com.tcp.cleanmanagement.controller;

import com.tcp.cleanmanagement.service.UpstashImportService;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DirectEsp32ControllerTest {
    private final UpstashImportService importer = mock(UpstashImportService.class);
    private final com.tcp.cleanmanagement.service.DeviceCredentialService credentials=mock(com.tcp.cleanmanagement.service.DeviceCredentialService.class);
    @org.junit.jupiter.api.BeforeEach void credentials(){
        when(credentials.authenticate(mac,"device-test-key")).thenReturn(new com.tcp.cleanmanagement.security.DeviceIdentity(mac));
        when(credentials.authenticate(mac,null)).thenThrow(new ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED));
        when(credentials.authenticate(mac,"wrong")).thenThrow(new ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED));
    }
    private final String mac = "AA:BB:CC:DD:EE:FF";
    private final DirectEsp32Controller controller = new DirectEsp32Controller(importer,
            JsonMapper.builder().build(), credentials);
    private final String payload = "{\"source\":\"esp32_direct\",\"mac_address\":\"AA:BB:CC:DD:EE:FF\","
            + "\"sample_key\":\"packet-one\",\"measured_at\":\"2026-10-12T05:30:17Z\"}";

    @Test
    void rejectsMissingOrIncorrectKeyBeforeWriting() {
        assertEquals(401, assertThrows(ResponseStatusException.class, () -> controller.receive(null, mac, payload)).getStatusCode().value());
        assertEquals(401, assertThrows(ResponseStatusException.class, () -> controller.receive("wrong", mac, payload)).getStatusCode().value());
        verifyNoInteractions(importer);
    }

    @Test
    void refusesDifferentDeviceEvenWithValidKey() {
        assertEquals(403, assertThrows(ResponseStatusException.class,
                () -> controller.receive("device-test-key", mac, payload.replace(mac, "00:11:22:33:44:55"))).getStatusCode().value());
        verifyNoInteractions(importer);
    }

    @Test
    void acknowledgesNewPacketAndIdenticalRetryWithSameSampleKey() {
        when(importer.receiveDirectSample(payload)).thenReturn(true, false);
        var first = controller.receive("device-test-key", mac, payload);
        assertEquals(201, first.getStatusCode().value());
        assertEquals("packet-one", first.getBody().get("sampleKey"));
        assertEquals("mysql", first.getBody().get("destination"));
        assertEquals(true, first.getBody().get("stored"));
        var retry = controller.receive("device-test-key", mac, payload);
        assertEquals(200, retry.getStatusCode().value());
        assertEquals(true, retry.getBody().get("duplicate"));
    }

    @Test
    void malformedPacketIsRejectedAndDatabaseFailureCannotBeAcknowledged() {
        assertEquals(400, assertThrows(ResponseStatusException.class,
                () -> controller.receive("device-test-key", mac, "{bad-json}")).getStatusCode().value());
        verifyNoInteractions(importer);
        when(importer.receiveDirectSample(payload)).thenThrow(new DataAccessResourceFailureException("Database unavailable"));
        assertThrows(DataAccessResourceFailureException.class, () -> controller.receive("device-test-key", mac, payload));
    }

    @Test void revokedCredentialsCannotWrite() {
        when(credentials.authenticate(mac,"device-test-key")).thenThrow(new ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED));
        assertEquals(401,assertThrows(ResponseStatusException.class,()->controller.receive("device-test-key",mac,payload)).getStatusCode().value());
        verifyNoInteractions(importer);
    }
}
