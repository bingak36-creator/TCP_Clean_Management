package com.tcp.cleanmanagement.controller;

import com.tcp.cleanmanagement.dto.DeviceSetResponse;
import com.tcp.cleanmanagement.dto.SensorDataRequest;
import com.tcp.cleanmanagement.service.IotDataService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/iot")
@RequiredArgsConstructor
public class IotController {
    private final IotDataService iotDataService;
    private final com.tcp.cleanmanagement.service.DeviceCredentialService credentials;

    // 1. ESP32 기기 자동 설정 및 센서 ID 조회
    @GetMapping("/device-sets/by-mac/{mac}")
    public ResponseEntity<DeviceSetResponse> getDeviceSetByMac(@PathVariable String mac, @RequestAttribute(com.tcp.cleanmanagement.security.DeviceIdentity.ATTRIBUTE) com.tcp.cleanmanagement.security.DeviceIdentity device) {
        if(!device.macAddress().equalsIgnoreCase(mac)) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN);
        return ResponseEntity.ok(iotDataService.getDeviceSetByMac(mac));
    }

    // 2. 센서별 측정값 수신 API (기존 및 단축 경로 공용)
    @PostMapping({"/sensors/{sensorId}/data", "/{sensorId}/data"})
    public ResponseEntity<Void> receiveSensorData(@PathVariable Long sensorId, @Valid @RequestBody SensorDataRequest request, @RequestAttribute(com.tcp.cleanmanagement.security.DeviceIdentity.ATTRIBUTE) com.tcp.cleanmanagement.security.DeviceIdentity device) {
        credentials.requireSensor(device.macAddress(),sensorId);
        if(request.getMacAddress()!=null && !device.macAddress().equalsIgnoreCase(request.getMacAddress())) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN);
        request.setMacAddress(device.macAddress());
        iotDataService.saveSensorData(sensorId, request);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }
    private final com.tcp.cleanmanagement.service.DeviceLocationService locations;
    @PostMapping("/device-sets/by-mac/{mac}/location")
    public ResponseEntity<Void> updateLocation(@PathVariable String mac,
            @Valid @RequestBody com.tcp.cleanmanagement.dto.DeviceLocationUpdateRequest request,
            @RequestAttribute(com.tcp.cleanmanagement.security.DeviceIdentity.ATTRIBUTE) com.tcp.cleanmanagement.security.DeviceIdentity identity) {
        if(!identity.macAddress().equalsIgnoreCase(mac)) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN);
        locations.update(identity.macAddress(),request);return ResponseEntity.ok().build();
    }
}
