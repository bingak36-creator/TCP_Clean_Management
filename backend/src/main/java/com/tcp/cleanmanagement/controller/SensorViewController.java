package com.tcp.cleanmanagement.controller;

import com.tcp.cleanmanagement.service.SensorViewService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/iot/devices")
@RequiredArgsConstructor
public class SensorViewController {
    private final SensorViewService service;

    @GetMapping
    public List<SensorViewService.Snapshot> snapshots(@RequestParam(defaultValue = "mysql") String source) {
        return service.snapshots(source);
    }

    @GetMapping("/{mac}/history")
    public List<SensorViewService.Point> history(@PathVariable String mac,
            @RequestParam(defaultValue = "mysql") String source,
            @RequestParam(defaultValue = "1") int hours,
            @RequestParam(defaultValue = "200") int limit) {
        return service.history(mac, source, hours, limit);
    }
}
