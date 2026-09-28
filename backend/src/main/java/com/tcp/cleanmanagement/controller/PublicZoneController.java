package com.tcp.cleanmanagement.controller;

import com.tcp.cleanmanagement.dto.ZonePublicResponse;
import com.tcp.cleanmanagement.dto.ZoneStatusResponse;
import com.tcp.cleanmanagement.service.PublicZoneService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
public class PublicZoneController {
    private final PublicZoneService publicZoneService;

    @GetMapping("/bathrooms")
    public ResponseEntity<List<ZonePublicResponse>> getAllBathrooms() {
        return ResponseEntity.ok(publicZoneService.getAllBathrooms());
    }

    @GetMapping("/zones/{zoneId}/status")
    public ResponseEntity<ZoneStatusResponse> getZoneStatus(@PathVariable Long zoneId) {
        return ResponseEntity.ok(publicZoneService.getZoneStatus(zoneId));
    }
}
