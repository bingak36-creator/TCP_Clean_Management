package com.tcp.cleanmanagement.controller;

import com.tcp.cleanmanagement.dto.DeviceSetRequest;
import com.tcp.cleanmanagement.dto.DeviceSetResponse;
import com.tcp.cleanmanagement.dto.DeviceSetUpdateRequest;
import com.tcp.cleanmanagement.dto.DeviceSetHistoryResponse;
import com.tcp.cleanmanagement.service.DeviceSetService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class DeviceSetController {
    private final DeviceSetService deviceSetService;

    @PostMapping("/api/admin/device-sets")
    @ResponseStatus(HttpStatus.CREATED)
    public DeviceSetResponse register(@Valid @RequestBody DeviceSetRequest request) {
        return deviceSetService.register(request);
    }

    @GetMapping("/api/admin/device-sets")
    public List<DeviceSetResponse> list() {
        return deviceSetService.list();
    }

    @PatchMapping("/api/admin/device-sets/{deviceSetId}")
    public DeviceSetResponse update(@PathVariable Long deviceSetId,
                                    @Valid @RequestBody DeviceSetUpdateRequest request) {
        return deviceSetService.update(deviceSetId, request);
    }

    @GetMapping("/api/admin/device-sets/{deviceSetId}/history")
    public List<DeviceSetHistoryResponse> history(@PathVariable Long deviceSetId) {
        return deviceSetService.history(deviceSetId);
    }

    @GetMapping("/api/iot/device-sets/by-mac/{macAddress}")
    public DeviceSetResponse configuration(@PathVariable String macAddress) {
        return deviceSetService.configurationFor(macAddress);
    }
}
