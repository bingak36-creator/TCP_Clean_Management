package com.tcp.cleanmanagement.security;
import com.tcp.cleanmanagement.enums.Role;
import com.tcp.cleanmanagement.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
@Service @RequiredArgsConstructor
public class AccessService {
    private final DeviceSetRepository sets;
    private final SensorRepository sensors;
    public AuthPrincipal current() {
        var attributes = RequestContextHolder.getRequestAttributes();
        if (!(attributes instanceof ServletRequestAttributes request)) throw denied(HttpStatus.UNAUTHORIZED);
        var principal = request.getRequest().getAttribute(AuthPrincipal.ATTRIBUTE);
        if (!(principal instanceof AuthPrincipal user)) throw denied(HttpStatus.UNAUTHORIZED);
        return user;
    }
    public boolean isDeveloper() { return current().role() == Role.DEVELOPER; }
    public void requireDeveloper() { if (!isDeveloper()) throw denied(HttpStatus.FORBIDDEN); }
    public void requireManager() { if (current().role() == Role.CLEANER) throw denied(HttpStatus.FORBIDDEN); }
    public boolean canZone(Long zoneId) { return zoneId != null && (isDeveloper() || current().zoneIds().contains(zoneId)); }
    public void requireZone(Long zoneId) { if (!canZone(zoneId)) throw denied(HttpStatus.FORBIDDEN); }
    @Transactional(readOnly=true)
    public void requireDeviceSet(Long id) { requireZone(sets.findById(id).orElseThrow(() -> denied(HttpStatus.NOT_FOUND)).getZone().getId()); }
    @Transactional(readOnly=true)
    public void requireSensor(Long id) { requireZone(sensors.findById(id).orElseThrow(() -> denied(HttpStatus.NOT_FOUND)).getZone().getId()); }
    private ResponseStatusException denied(HttpStatus status) { return new ResponseStatusException(status, "Access is not allowed"); }
}
