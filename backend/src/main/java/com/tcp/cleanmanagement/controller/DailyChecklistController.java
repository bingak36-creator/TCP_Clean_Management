package com.tcp.cleanmanagement.controller;
import com.tcp.cleanmanagement.dto.ChecklistToggleRequest;
import com.tcp.cleanmanagement.entity.DailyChecklist;
import com.tcp.cleanmanagement.security.AccessService;
import com.tcp.cleanmanagement.service.ChecklistService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;
@RestController @RequestMapping("/api/admin/checklists") @RequiredArgsConstructor
public class DailyChecklistController {
    private final ChecklistService items; private final AccessService access;
    @GetMapping public List<DailyChecklist> list(@RequestParam Long zoneId,@RequestParam(required=false) String date){access.requireZone(zoneId);return items.list(zoneId,date);}
    @PostMapping("/toggle") public DailyChecklist set(@RequestBody ChecklistToggleRequest request){access.requireZone(request.getZoneId());return items.set(request,access.current().id());}
    public record Batch(Long zoneId,String date,java.util.Map<String,Boolean> items) {}
    @PostMapping("/batch") public List<DailyChecklist> batch(@RequestBody Batch request) {
        access.requireZone(request.zoneId());return items.batch(request.zoneId(),request.date(),request.items(),access.current().id());
    }
}
