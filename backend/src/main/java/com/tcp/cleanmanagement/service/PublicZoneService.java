package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.ZonePublicResponse;
import com.tcp.cleanmanagement.dto.ZoneStatusResponse;
import com.tcp.cleanmanagement.entity.SensorDataRaw;
import com.tcp.cleanmanagement.entity.Zone;
import com.tcp.cleanmanagement.enums.MetricCode;
import com.tcp.cleanmanagement.enums.SensorModel;
import com.tcp.cleanmanagement.enums.ZoneType;
import com.tcp.cleanmanagement.repository.SensorDataRawRepository;
import com.tcp.cleanmanagement.repository.ZoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PublicZoneService {
    private final ZoneRepository zoneRepository;
    private final SensorDataRawRepository sensorDataRawRepository;

    @Transactional(readOnly = true)
    public List<ZonePublicResponse> getZones(ZoneType type, Double lat, Double lng, Double radius) {
        List<Zone> zones;

        // 위치 정보가 들어왔다면 반경 검색 수행, 아니면 전체 반환
        if (lat != null && lng != null && radius != null) {
            if (type != null) {
                zones = zoneRepository.findZonesByTypeAndRadius(type.name(), lat, lng, radius);
            } else {
                zones = zoneRepository.findZonesWithinRadius(lat, lng, radius);
            }
        } else {
            if (type != null) {
                zones = zoneRepository.findByZoneType(type);
            } else {
                zones = zoneRepository.findAll();
            }
        }

        return zones.stream()
            .map(this::mapToResponseWithSensorData)
            .collect(Collectors.toList());
    }

    private ZonePublicResponse mapToResponseWithSensorData(Zone zone) {
        ZonePublicResponse.ZonePublicResponseBuilder builder = ZonePublicResponse.builder()
                .zoneId(zone.getId())
                .name(zone.getName())
                .latitude(zone.getLatitude())
                .longitude(zone.getLongitude())
                .isOurSolution(zone.getIsOurSolution());

        Optional<SensorDataRaw> latestMq135 = latestSensorReading(zone.getId(), SensorModel.MQ135);
        if (latestMq135.isEmpty()) {
            latestMq135 = latestReading(zone.getId(), MetricCode.GAS);
        }
        Optional<SensorDataRaw> latestMq7 = latestSensorReading(zone.getId(), SensorModel.MQ7);

        latestReading(zone.getId(), MetricCode.TEMPERATURE)
                .ifPresent(data -> builder.temp(data.getMeasuredValue().floatValue()));
        latestReading(zone.getId(), MetricCode.HUMIDITY)
                .ifPresent(data -> builder.humidity(data.getMeasuredValue().floatValue()));
        latestMq7
                .ifPresent(data -> builder.mq7Level(data.getMeasuredValue().floatValue()));

        if (latestMq135.isPresent()) {
            SensorDataRaw data = latestMq135.get();
            float gasLevel = data.getMeasuredValue().floatValue();
            builder.gasLevel(gasLevel);

            if (zone.getZoneType() == ZoneType.TOILET) {
                if (zone.getPleasantThreshold() == null) {
                    builder.status("Unknown").color("#9ca3af");
                } else {
                    boolean isClean = gasLevel < zone.getPleasantThreshold();
                    builder.status(isClean ? "Clean" : "Needs Cleaning");
                    builder.color(isClean ? "#10b981" : "#ef4444");
                }
            } else {
                boolean isCrowded = gasLevel > 200.0f;
                builder.status(isCrowded ? "Crowded" : "Spacious");
                builder.color(isCrowded ? "#f59e0b" : "#3b82f6");
            }
        } else {
            builder.status("No Data");
            builder.color("#9ca3af");
        }

        return builder.build();
    }

    private Optional<SensorDataRaw> latestReading(Long zoneId, MetricCode metricCode) {
        return sensorDataRawRepository
                .findFirstByMetricSensorZoneIdAndMetricMetricCodeOrderByMeasuredAtDescIdDesc(zoneId, metricCode);
    }

    private Optional<SensorDataRaw> latestSensorReading(Long zoneId, SensorModel sensorModel) {
        return sensorDataRawRepository
                .findFirstByMetricSensorZoneIdAndMetricSensorSensorModelOrderByMeasuredAtDescIdDesc(zoneId, sensorModel);
    }

    @Transactional(readOnly = true)
    public ZoneStatusResponse getZoneStatus(Long zoneId) {
        Zone zone = zoneRepository.findById(zoneId)
                .orElseThrow(() -> new IllegalArgumentException("Zone not found"));

        return ZoneStatusResponse.builder()
                .zoneId(zone.getId())
                .name(zone.getName())
                .status("NORMAL")
                .statusMessage("이용하기 적절한 상태입니다.")
                .build();
    }
}
