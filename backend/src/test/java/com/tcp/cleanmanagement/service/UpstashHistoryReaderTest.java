package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.config.UpstashSyncProperties;
import org.junit.jupiter.api.Test;
import java.net.http.*;
import java.util.Set;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class UpstashHistoryReaderTest {
    @Test
    void restDiscoveryUsesAuthorizationHeaderAndDoesNotSendCredentialsInUrl() throws Exception {
        var properties = new UpstashSyncProperties();
        properties.setRedisUrl("https://default:test-token@demo.upstash.io");
        HttpClient client = mock(HttpClient.class);
        HttpResponse<String> response = response(200,
                "{\"result\":[\"0\",[\"esp32:AA:BB:CC:DD:EE:FF:history\",\"esp32:invalid:history\"]]}");
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenAnswer(call -> {
            HttpRequest request = call.getArgument(0);
            assertNull(request.uri().getUserInfo());
            assertEquals("https://demo.upstash.io/", request.uri().toString());
            assertEquals("Bearer test-token", request.headers().firstValue("Authorization").orElseThrow());
            return response;
        });
        var reader = new UpstashHistoryReader(properties, JsonMapper.builder().build(), client);
        assertEquals(Set.of("AA:BB:CC:DD:EE:FF"), reader.discoverDevices());
    }

    @Test
    void restReadsOriginalPayloadsAndScoresWithSeparateTokenConfiguration() throws Exception {
        var properties = new UpstashSyncProperties();
        properties.setRedisUrl("https://demo.upstash.io");
        properties.setRestToken("test-token");
        HttpClient client = mock(HttpClient.class);
        HttpResponse<String> response = response(200, "{\"result\":[\"packet-one\",\"100\",\"packet-two\",\"101\"]}");
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(response);
        var reader = new UpstashHistoryReader(properties, JsonMapper.builder().build(), client);
        var page = reader.readPage("AA:BB:CC:DD:EE:FF", 100, 0);
        assertEquals(2, page.size());
        assertEquals("packet-one", page.get(0).getValue());
        assertEquals(101, page.get(1).getScore());
    }

    @Test
    void authenticationFailureDoesNotLeakTokenOrCredentialUrl() throws Exception {
        var properties = new UpstashSyncProperties();
        properties.setRedisUrl("https://default:test-token@demo.upstash.io");
        HttpClient client = mock(HttpClient.class);
        HttpResponse<String> response = response(401, "{\"error\":\"unauthorized\"}");
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(response);
        var reader = new UpstashHistoryReader(properties, JsonMapper.builder().build(), client);
        var error = assertThrows(IllegalStateException.class, reader::discoverDevices);
        assertFalse(error.getMessage().contains("test-token"));
        assertFalse(error.getMessage().contains("https://"));
    }

    @SuppressWarnings("unchecked")
    private HttpResponse<String> response(int status, String body) {
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(body);
        return response;
    }
}
