package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.SensorCreateRequest;
import com.tcp.cleanmanagement.dto.ZoneCreateRequest;
import com.tcp.cleanmanagement.entity.Sensor;
import com.tcp.cleanmanagement.entity.Zone;
import com.tcp.cleanmanagement.enums.SensorStatus;
import com.tcp.cleanmanagement.repository.SensorRepository;
import com.tcp.cleanmanagement.repository.ZoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class DevZoneService {
    private final ZoneRepository zoneRepository;
    private final SensorRepository sensorRepository;

    @Transactional
    public Long createZone(ZoneCreateRequest request) {
        Zone zone = Zone.builder()
                .name(request.getName())
                .address(request.getAddress())
                .latitude(request.getLatitude())
                .longitude(request.getLongitude())
                .zoneType(request.getZoneType())
                .isOurSolution(request.getIsOurSolution())
                .pleasantThreshold(request.getPleasantThreshold())
                .needsVentilationThreshold(request.getNeedsVentilationThreshold())
                .build();
        
        return zoneRepository.save(zone).getId();
    }

    @Transactional
    public Long createSensor(SensorCreateRequest request) {
        Zone zone = zoneRepository.findById(request.getZoneId())
                .orElseThrow(() -> new IllegalArgumentException("Invalid Zone ID"));

        Sensor sensor = Sensor.builder()
                .zone(zone)
                .sensorType(request.getSensorType())
                .status(SensorStatus.ACTIVE)
                .build();

        return sensorRepository.save(sensor).getId();
    }
}
