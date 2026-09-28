package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.ZonePublicResponse;
import com.tcp.cleanmanagement.dto.ZoneStatusResponse;
import com.tcp.cleanmanagement.entity.Zone;
import com.tcp.cleanmanagement.repository.ZoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PublicZoneService {
    private final ZoneRepository zoneRepository;

    @Transactional(readOnly = true)
    public List<ZonePublicResponse> getAllBathrooms() {
        return zoneRepository.findAll().stream()
            .map(zone -> ZonePublicResponse.builder()
                .zoneId(zone.getId())
                .name(zone.getName())
                .latitude(zone.getLatitude())
                .longitude(zone.getLongitude())
                .isOurSolution(zone.getIsOurSolution())
                .build())
            .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public ZoneStatusResponse getZoneStatus(Long zoneId) {
        Zone zone = zoneRepository.findById(zoneId)
                .orElseThrow(() -> new IllegalArgumentException("Zone not found"));

        // Here we would ideally check recent SensorDataRaw like in AnalyticsService
        // For demonstration, returning a mocked status calculation
        return ZoneStatusResponse.builder()
                .zoneId(zone.getId())
                .name(zone.getName())
                .status("NORMAL") 
                .statusMessage("이용하기 적절한 상태입니다.")
                .build();
    }
}
