package com.tcp.cleanmanagement.controller;

import com.tcp.cleanmanagement.dto.ActionRequest;
import com.tcp.cleanmanagement.dto.AlertResponse;
import com.tcp.cleanmanagement.service.AdminAlertService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/alerts")
@RequiredArgsConstructor
public class AdminAlertController {
    private final AdminAlertService adminAlertService;

    @GetMapping
    public ResponseEntity<List<AlertResponse>> getUnresolvedAlerts() {
        return ResponseEntity.ok(adminAlertService.getUnresolvedAlerts());
    }

    @PostMapping("/{alertId}/actions")
    public ResponseEntity<Void> resolveAlert(
            @PathVariable Long alertId, 
            @RequestBody ActionRequest request) {
        adminAlertService.resolveAlert(alertId, request);
        return ResponseEntity.ok().build();
    }
}
