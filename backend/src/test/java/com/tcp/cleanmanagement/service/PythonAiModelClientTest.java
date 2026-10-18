package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.config.AiProperties;
import com.tcp.cleanmanagement.dto.AiObservation;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.nio.file.Files;
import java.time.Duration;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;

class PythonAiModelClientTest {
    @Test
    void startsBundledRealModelsAndReusesTheWorkerForIdempotentPredictions() {
        AiProperties properties = new AiProperties();
        try (PythonAiModelClient client = new ClosableClient(properties)) {
            client.start();
            String session = client.status().get("sessionId").toString();
            var input = new AiObservation("java-smoke", "java-device", "2026-10-17T00:00:00Z",
                    new BigDecimal("24"), new BigDecimal("55"), new BigDecimal("400"), "DHT22");
            var first = client.predict(input);
            assertEquals("준비 중", first.level());
            assertFalse(first.ready().get("environment"));
            assertTrue(first.alerts().isEmpty());
            assertEquals(first, client.predict(input));
            assertEquals(session, client.status().get("sessionId"));
            assertEquals("environment-v3-indoor-22-mixed", first.modelVersion());
        }
    }

    @Test
    void stalledWorkerIsKilledAtTheConfiguredTimeout(@TempDir Path directory) throws Exception {
        Files.writeString(directory.resolve("worker.py"),
                "import json,time\nprint(json.dumps({'type':'ready','models_loaded':5,'model_version':'test'}),flush=True)\ntime.sleep(60)\n");
        AiProperties properties = new AiProperties();
        properties.setDirectory(directory.toString()); properties.setTimeoutSeconds(1);
        try (PythonAiModelClient client = new ClosableClient(properties)) {
            client.start();
            var input = new AiObservation("timeout", "timeout-device", "2026-10-17T00:00:00Z",
                    BigDecimal.valueOf(24), BigDecimal.valueOf(55), BigDecimal.valueOf(400), "DHT22");
            assertTimeoutPreemptively(Duration.ofSeconds(5),
                    () -> assertThrows(IllegalStateException.class, () -> client.predict(input)));
            assertEquals(false, client.status().get("loaded"));
        }
    }

    // The production client also closes on Spring shutdown.
    private static class ClosableClient extends PythonAiModelClient {
        ClosableClient(AiProperties properties) { super(properties, JsonMapper.builder().build()); }
    }
}
