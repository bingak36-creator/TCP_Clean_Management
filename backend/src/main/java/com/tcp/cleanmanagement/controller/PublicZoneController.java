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
    public ResponseEntity<List<ZonePublicResponse>> getBathrooms(
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng,
            @RequestParam(required = false, defaultValue = "2.0") Double radius) { // 기본 반경 2km
        
        return ResponseEntity.ok(publicZoneService.getBathrooms(lat, lng, radius));
    }

    @GetMapping("/zones/{zoneId}/status")
    public ResponseEntity<ZoneStatusResponse> getZoneStatus(@PathVariable Long zoneId) {
        return ResponseEntity.ok(publicZoneService.getZoneStatus(zoneId));
    }
}
