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
    private final com.tcp.cleanmanagement.security.AccessService access;

    @GetMapping
    public ResponseEntity<List<AlertResponse>> getUnresolvedAlerts(@RequestParam(defaultValue="UNRESOLVED") String status) {
        return ResponseEntity.ok(adminAlertService.getAlerts(status).stream().filter(a -> access.canZone(a.getZoneId())).toList());
    }

    @PostMapping("/{alertId}/actions")
    public ResponseEntity<Void> resolveAlert(
            @PathVariable Long alertId, 
            @jakarta.validation.Valid @RequestBody ActionRequest request) {
        access.requireManager();
        access.requireZone(adminAlertService.zoneId(alertId));
        request.setAdminId(access.current().id());
        adminAlertService.resolveAlert(alertId, request);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/batch-actions")
    public ResponseEntity<Void> resolveAllAlerts(@jakarta.validation.Valid @RequestBody(required = false) ActionRequest request) {
        if (request == null) {
            request = new ActionRequest();
            request.setActionDetail("관리자 일괄 확인 처리");

        }
        access.requireManager();
        request.setAdminId(access.current().id());
        adminAlertService.resolveAllAlerts(request, access.isDeveloper() ? null : access.current().zoneIds());
        return ResponseEntity.ok().build();
    }
}
