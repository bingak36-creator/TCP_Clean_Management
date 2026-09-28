package com.tcp.cleanmanagement.controller;

import com.tcp.cleanmanagement.dto.SensorDataRequest;
import com.tcp.cleanmanagement.service.IotDataService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/iot/sensors")
@RequiredArgsConstructor
public class IotController {
    private final IotDataService iotDataService;

    @PostMapping("/{sensorId}/data")
    public ResponseEntity<Void> receiveSensorData(@PathVariable Long sensorId, @Valid @RequestBody SensorDataRequest request) {
        iotDataService.saveSensorData(sensorId, request);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }
}
