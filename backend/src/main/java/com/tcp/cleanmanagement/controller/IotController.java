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

    // 1. ESP32 기기 자동 설정 및 센서 ID 조회
    @GetMapping("/device-sets/by-mac/{mac}")
    public ResponseEntity<DeviceSetResponse> getDeviceSetByMac(@PathVariable String mac) {
        return ResponseEntity.ok(iotDataService.getDeviceSetByMac(mac));
    }

    // 2. 센서별 측정값 수신 API (기존 및 ESP32 공용)
    @PostMapping({"/sensors/{sensorId}/data", "/{sensorId}/data"})
    public ResponseEntity<Void> receiveSensorData(@PathVariable Long sensorId, @Valid @RequestBody SensorDataRequest request) {
        iotDataService.saveSensorData(sensorId, request);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }
}
