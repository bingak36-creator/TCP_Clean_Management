package com.tcp.cleanmanagement.service;
import com.tcp.cleanmanagement.dto.DeviceLocationUpdateRequest;
import com.tcp.cleanmanagement.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@Service @RequiredArgsConstructor
public class DeviceLocationService {
    private final DeviceSetRepository sets;private final ZoneRepository zones;
    @Transactional public void update(String mac,DeviceLocationUpdateRequest request) {
        Double lat=request.getLatitude(),lon=request.getLongitude();
        if(lat==null||lon==null||!Double.isFinite(lat)||!Double.isFinite(lon)||lat< -90||lat>90||lon< -180||lon>180)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid coordinates");
        var set=sets.findByMacAddress(mac).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        var zone=zones.findByIdForUpdate(set.getZone().getId()).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        zone.setLatitude(lat);zone.setLongitude(lon);
    }
}
