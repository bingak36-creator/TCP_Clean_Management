package com.tcp.cleanmanagement.controller;
import com.tcp.cleanmanagement.security.AccessService;
import com.tcp.cleanmanagement.service.OperationalSettingsService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
@RestController @RequestMapping("/api/admin/settings") @RequiredArgsConstructor
public class SystemSettingController {
    private final OperationalSettingsService settings; private final AccessService access;
    @GetMapping public Map<String,String> get(){return settings.all();}
    @PutMapping public Map<String,String> update(@RequestBody Map<String,String> changes) {
        access.requireDeveloper(); return settings.update(changes,access.current().id());
    }
}
