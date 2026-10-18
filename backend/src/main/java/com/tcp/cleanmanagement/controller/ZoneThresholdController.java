package com.tcp.cleanmanagement.controller;
import com.tcp.cleanmanagement.dto.ZoneCreateRequest;
import com.tcp.cleanmanagement.security.AccessService;
import com.tcp.cleanmanagement.service.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController @RequiredArgsConstructor
public class ZoneThresholdController {
    private final AccessService access; private final DevZoneService zones; private final OperationalSettingsService settings;
    public record Thresholds(@NotEmpty Set<@Positive Long> zoneIds,@NotNull Float pleasantThreshold,@NotNull Float needsVentilationThreshold,Map<String,String> globalSettings){}
    @PutMapping("/api/admin/zone-thresholds") @Transactional
    public void update(@Valid @RequestBody Thresholds request){
        access.requireManager();request.zoneIds().forEach(access::requireZone);
        if(request.globalSettings()!=null && !request.globalSettings().isEmpty()){access.requireDeveloper();settings.update(request.globalSettings(),access.current().id());}
        var dto=new ZoneCreateRequest();dto.setPleasantThreshold(request.pleasantThreshold());dto.setNeedsVentilationThreshold(request.needsVentilationThreshold());
        for(Long id:request.zoneIds().stream().sorted().toList()) zones.updateZone(id,dto);
    }
}
