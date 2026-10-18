package com.tcp.cleanmanagement.controller;
import com.tcp.cleanmanagement.dto.FacilityRequest;
import com.tcp.cleanmanagement.entity.Zone;
import com.tcp.cleanmanagement.security.AccessService;
import com.tcp.cleanmanagement.service.FacilityService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/dev/facilities") @RequiredArgsConstructor
public class FacilityController {
    private final FacilityService facilities;private final AccessService access;
    @PostMapping public Long create(@Valid @RequestBody FacilityRequest request){access.requireDeveloper();return facilities.create(request);}
    @PutMapping("/{id}") public Zone update(@PathVariable Long id,@Valid @RequestBody FacilityRequest request){access.requireDeveloper();return facilities.update(id,request);}
}
