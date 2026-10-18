package com.tcp.cleanmanagement.controller;
import com.tcp.cleanmanagement.dto.DiscoveredDeviceResponse;
import com.tcp.cleanmanagement.security.AccessService;
import com.tcp.cleanmanagement.service.DiscoveredDeviceService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
@RestController @RequiredArgsConstructor
public class DiscoveredDeviceController {
    private final DiscoveredDeviceService devices; private final AccessService access;
    public record Discovery(@NotBlank @Pattern(regexp="(?i)([0-9a-f]{2}:){5}[0-9a-f]{2}") String macAddress,
        @DecimalMin("-90") @DecimalMax("90") Double latitude,@DecimalMin("-180") @DecimalMax("180") Double longitude) {}
    @PostMapping("/api/iot/discovery") @ResponseStatus(HttpStatus.ACCEPTED)
    public void announce(@Valid @RequestBody Discovery data,HttpServletRequest request) {
        if((data.latitude()==null)!=(data.longitude()==null) || data.latitude()!=null &&
            (!Double.isFinite(data.latitude())||!Double.isFinite(data.longitude())))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Supply a valid coordinate pair");
        devices.record(data.macAddress(),request.getRemoteAddr(),data.latitude(),data.longitude());
    }
    @GetMapping("/api/admin/discovered-devices")
    public List<DiscoveredDeviceResponse> list(){access.requireDeveloper();return devices.list();}
    @DeleteMapping("/api/admin/discovered-devices/{mac}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@PathVariable String mac){access.requireDeveloper();devices.remove(mac);}
}
