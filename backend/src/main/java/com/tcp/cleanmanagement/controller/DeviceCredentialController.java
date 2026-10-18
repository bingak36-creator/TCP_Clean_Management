package com.tcp.cleanmanagement.controller;
import com.tcp.cleanmanagement.security.AccessService;
import com.tcp.cleanmanagement.service.DeviceCredentialService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/admin/device-credentials") @RequiredArgsConstructor
public class DeviceCredentialController {
    private final DeviceCredentialService credentials; private final AccessService access;
    @GetMapping("/{mac}") public DeviceCredentialService.Metadata get(@PathVariable String mac){access.requireDeveloper();return credentials.metadata(mac);}
    @PostMapping("/{mac}/rotate") public ResponseEntity<DeviceCredentialService.Issued> rotate(@PathVariable String mac){
        access.requireDeveloper();return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(credentials.rotate(mac,access.current().id()));
    }
    @DeleteMapping("/{mac}") public ResponseEntity<Void> revoke(@PathVariable String mac){access.requireDeveloper();credentials.revoke(mac,access.current().id());return ResponseEntity.noContent().build();}
}
