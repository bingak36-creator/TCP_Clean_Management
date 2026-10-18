package com.tcp.cleanmanagement.controller;

import com.tcp.cleanmanagement.dto.SensorCreateRequest;
import com.tcp.cleanmanagement.dto.ZoneCreateRequest;
import com.tcp.cleanmanagement.service.DevZoneService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping({"/api/dev", "/api/admin"})
@RequiredArgsConstructor
public class DevZoneController {
    private final DevZoneService devZoneService;
    private final com.tcp.cleanmanagement.service.ZoneWorkerService assignments;
    private final com.tcp.cleanmanagement.repository.WorkerRepository workers;
    private final com.tcp.cleanmanagement.service.SensorManagementService sensors;
    private final com.tcp.cleanmanagement.security.AccessService access;
    private final com.tcp.cleanmanagement.service.PublicZoneService views;
    @GetMapping("/zones") public java.util.List<com.tcp.cleanmanagement.dto.ZonePublicResponse> zones() {
        return views.adminZones().stream().filter(z -> access.canZone(z.getZoneId())).toList();
    }

    @PostMapping("/zones")
    public ResponseEntity<Long> createZone(@jakarta.validation.Valid @RequestBody ZoneCreateRequest request) {
        access.requireDeveloper(); return ResponseEntity.ok(devZoneService.createZone(request));
    }

    @PostMapping("/sensors")
    public ResponseEntity<Long> createSensor(@RequestBody SensorCreateRequest request) {
        access.requireDeveloper(); return ResponseEntity.ok(devZoneService.createSensor(request));
    }

    @PutMapping("/sensors/{sensorId}/gas-calibration")
    public DevZoneService.GasCalibration calibrateGas(@PathVariable Long sensorId, @jakarta.validation.Valid @RequestBody DevZoneService.GasCalibration request) {
        access.requireDeveloper(); return devZoneService.calibrateGas(sensorId, request);
    }

    @DeleteMapping("/zones/{id}")
    public ResponseEntity<Void> deleteZone(@PathVariable Long id) {
        access.requireDeveloper(); devZoneService.deleteZone(id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/zones/{id}/toggle-active")
    public ResponseEntity<Boolean> toggleActive(@PathVariable Long id) {
        access.requireManager(); access.requireZone(id); return ResponseEntity.ok(devZoneService.toggleZoneActive(id));
    }

    @PutMapping("/zones/{id}")
    public ResponseEntity<?> updateZone(@PathVariable Long id, @jakarta.validation.Valid @RequestBody ZoneCreateRequest request) {
        access.requireManager(); access.requireZone(id);
        if (!access.isDeveloper() && (request.getName()!=null || request.getAddress()!=null || request.getFloor()!=null || request.getGender()!=null || request.getLatitude()!=null || request.getLongitude()!=null || request.getZoneType()!=null || request.getAssignedWorkerId()!=null || request.getAssignedWorkerName()!=null || request.getIsOurSolution()!=null))
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN);
        return ResponseEntity.ok(devZoneService.updateZone(id, request));
    }
    public record WorkerAssignment(Long workerId) {}
    @PatchMapping("/zones/{id}/worker")
    public com.tcp.cleanmanagement.entity.Zone assign(@PathVariable Long id,@RequestBody WorkerAssignment request) {
        access.requireManager();access.requireZone(id);
        if(request.workerId()!=null && !access.isDeveloper()) {
            var worker=workers.findById(request.workerId()).orElseThrow(()->new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND));
            access.requireZone(worker.getAssignedZoneId());
        }
        return assignments.assign(id,request.workerId());
    }
    @GetMapping("/sensors") public java.util.List<java.util.Map<String,Object>> listSensors(@RequestParam(required=false) Long zoneId) {
        if(zoneId!=null)access.requireZone(zoneId);
        return sensors.list(zoneId).stream().filter(row->access.canZone((Long)row.get("zoneId"))).toList();
    }
    @PatchMapping("/sensors/{id}") public java.util.Map<String,Object> updateSensor(@PathVariable Long id,@RequestBody SensorCreateRequest request) {
        access.requireDeveloper();return sensors.update(id,request);
    }
    @DeleteMapping("/sensors/{id}") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void deleteSensor(@PathVariable Long id){access.requireDeveloper();sensors.delete(id);}
}
