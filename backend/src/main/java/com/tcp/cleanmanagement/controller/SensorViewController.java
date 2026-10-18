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
    private final com.tcp.cleanmanagement.security.AccessService access;

    @GetMapping
    public List<SensorViewService.Snapshot> snapshots(@RequestParam(defaultValue = "mysql") String source) {
        return service.snapshots(source).stream().filter(s -> access.canZone(s.zoneId())).toList();
    }

    @GetMapping("/{mac}/history")
    public List<SensorViewService.Point> history(@PathVariable String mac,
            @RequestParam(defaultValue = "mysql") String source,
            @RequestParam(defaultValue = "1") int hours,
            @RequestParam(defaultValue = "200") int limit) {
        access.requireZone(service.zoneId(mac));
        return service.history(mac,source,hours,limit,access.isDeveloper()?null:new java.util.HashSet<>(access.current().zoneIds()));
    }
}
