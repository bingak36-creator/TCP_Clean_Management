package com.tcp.cleanmanagement.controller;

import com.tcp.cleanmanagement.dto.UpstashSample;
import com.tcp.cleanmanagement.service.UpstashImportService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.Map;

@RestController
@RequestMapping("/api/iot/esp32")
public class DirectEsp32Controller {
    private final UpstashImportService importer;
    private final JsonMapper mapper;
    private final String apiKey;
    private final String allowedMac;

    public DirectEsp32Controller(UpstashImportService importer, JsonMapper mapper,
            @Value("${iot.direct.api-key:}") String apiKey,
            @Value("${iot.direct.mac-address:}") String allowedMac) {
        this.importer = importer;
        this.mapper = mapper;
        this.apiKey = apiKey;
        this.allowedMac = allowedMac;
    }

    @PostMapping(consumes = "application/json")
    public ResponseEntity<Map<String, Object>> receive(
            @RequestHeader(value = "X-Device-Key", required = false) String providedKey,
            @RequestBody String payload) {
        if (apiKey.isBlank()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Direct ingestion is not configured");
        if (providedKey == null || !MessageDigest.isEqual(apiKey.getBytes(StandardCharsets.UTF_8),
                providedKey.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid device key");
        }
        if (payload.length() > 8192) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Packet is too large");
        UpstashSample sample;
        try {
            sample = mapper.readValue(payload, UpstashSample.class);
            if (!allowedMac.isBlank() && !allowedMac.equalsIgnoreCase(sample.macAddress())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Device is not allowed");
            }
            if (sample.measuredAt() == null || OffsetDateTime.parse(sample.measuredAt()).toInstant()
                    .isAfter(java.time.Instant.now().plusSeconds(300))) {
                throw new IllegalArgumentException("Invalid sample time");
            }
        } catch (ResponseStatusException error) {
            throw error;
        } catch (RuntimeException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid ESP32 packet");
        }
        boolean inserted;
        try {
            inserted = importer.receiveDirectSample(payload);
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid ESP32 packet");
        }
        return ResponseEntity.status(inserted ? HttpStatus.CREATED : HttpStatus.OK)
                .body(Map.of("stored", true, "duplicate", !inserted, "sampleKey", sample.sampleKey(), "destination", "mysql"));
    }
}
