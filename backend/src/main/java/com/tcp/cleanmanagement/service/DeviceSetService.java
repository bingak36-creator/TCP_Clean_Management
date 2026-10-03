package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.DeviceSetRequest;
import com.tcp.cleanmanagement.dto.DeviceSetResponse;
import com.tcp.cleanmanagement.dto.DeviceSetUpdateRequest;
import com.tcp.cleanmanagement.dto.DeviceSetHistoryResponse;
import com.tcp.cleanmanagement.entity.DeviceSet;
import com.tcp.cleanmanagement.entity.DeviceSetHistory;
import com.tcp.cleanmanagement.entity.Sensor;
import com.tcp.cleanmanagement.entity.Zone;
import com.tcp.cleanmanagement.enums.SensorModel;
import com.tcp.cleanmanagement.enums.SensorStatus;
import com.tcp.cleanmanagement.repository.DeviceSetRepository;
import com.tcp.cleanmanagement.repository.DeviceSetHistoryRepository;
import com.tcp.cleanmanagement.repository.SensorDataRawRepository;
import com.tcp.cleanmanagement.repository.AlertRepository;
import com.tcp.cleanmanagement.repository.SensorRepository;
import com.tcp.cleanmanagement.repository.ZoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

@Service
@RequiredArgsConstructor
public class DeviceSetService {
    private final DeviceSetRepository deviceSetRepository;
    private final SensorRepository sensorRepository;
    private final ZoneRepository zoneRepository;
    private final DeviceSetHistoryRepository historyRepository;
    private final SensorDataRawRepository rawRepository;
    private final AlertRepository alertRepository;

    @Transactional
    public DeviceSetResponse register(DeviceSetRequest request) {
        String mac = normalizeMac(request.getMacAddress());
        String code = request.getSetCode().toUpperCase(Locale.ROOT);
        String label = request.getInstallationLabel().trim();
        Map<SensorModel, Long> existingIds = request.getExistingSensorIds();
        if (existingIds != null && (!existingIds.keySet().equals(EnumSet.allOf(SensorModel.class))
                || existingIds.values().stream().anyMatch(id -> id == null || id <= 0)
                || new HashSet<>(existingIds.values()).size() != SensorModel.values().length)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Supply three distinct existing sensor IDs");
        }

        Optional<DeviceSet> existingSet = deviceSetRepository.findByMacAddress(mac);
        if (existingSet.isPresent()) {
            DeviceSet set = existingSet.get();
            DeviceSetResponse response = responseFor(set);
            if (!set.getSetCode().equals(code) || !set.getZone().getId().equals(request.getZoneId())
                    || !set.getInstallationLabel().equals(label)
                    || (existingIds != null && !response.getSensorIds().equals(existingIds))) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "MAC address is already assigned to another set");
            }
            return response;
        }
        if (deviceSetRepository.existsBySetCode(code)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Set code is already registered");
        }
        Zone zone = zoneRepository.findById(request.getZoneId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Zone not found"));

        Map<Long, Sensor> attached = new HashMap<>();
        if (existingIds != null) {
            // Lock in ID order so registrations sharing sensors cannot acquire locks in opposite order.
            for (Long id : existingIds.values().stream().sorted().toList()) {
                attached.put(id, sensorRepository.findByIdForUpdate(id)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sensor not found: " + id)));
            }
            for (SensorModel model : SensorModel.values()) {
                Sensor sensor = attached.get(existingIds.get(model));
                if (sensor.getDeviceSet() != null) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Sensor is already assigned to a set");
                }
                if (sensor.getSensorType() != model.sensorType()
                        || (sensor.getSensorModel() != null && sensor.getSensorModel() != model)
                        || sensor.getZone() == null || !sensor.getZone().getId().equals(zone.getId())) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Existing sensor type or zone does not match");
                }
            }
        }

        DeviceSet set;
        try {
            set = deviceSetRepository.saveAndFlush(DeviceSet.builder()
                    .setCode(code).macAddress(mac).zone(zone).installationLabel(label).build());
        } catch (DataIntegrityViolationException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Set code or MAC address is already registered", error);
        }
        for (SensorModel model : SensorModel.values()) {
            Sensor sensor = existingIds == null
                    ? Sensor.builder().zone(zone).sensorType(model.sensorType()).status(SensorStatus.ACTIVE).build()
                    : attached.get(existingIds.get(model));
            sensor.setDeviceSet(set);
            sensor.setSensorModel(model);
            sensorRepository.save(sensor);
        }
        sensorRepository.flush();
        initializeHistory(set);
        return responseFor(set);
    }

    @Transactional
    public DeviceSetResponse update(Long deviceSetId, DeviceSetUpdateRequest request) {
        if (request == null || (request.getZoneId() == null && request.getMacAddress() == null
                && request.getInstallationLabel() == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Supply at least one field to update");
        }
        String requestedMac = request.getMacAddress() == null ? null : normalizeMac(request.getMacAddress());
        String requestedLabel = request.getInstallationLabel() == null ? null : request.getInstallationLabel().trim();
        if ((requestedLabel != null && (requestedLabel.isBlank() || requestedLabel.length() > 100))
                || (request.getZoneId() != null && request.getZoneId() <= 0)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid installation label or zone ID");
        }

        // Ingestion locks a sensor first. Use the same order to keep its configuration
        // stable until the reading has been saved and avoid a set/sensor lock inversion.
        List<Sensor> sensors = sensorRepository.findByDeviceSetIdForUpdate(deviceSetId);
        DeviceSet set = deviceSetRepository.findByIdForUpdate(deviceSetId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Device set not found"));
        Zone zone = request.getZoneId() == null ? set.getZone() : zoneRepository.findById(request.getZoneId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Zone not found"));
        String mac = requestedMac == null ? set.getMacAddress() : requestedMac;
        String label = requestedLabel == null ? set.getInstallationLabel() : requestedLabel;
        deviceSetRepository.findByMacAddress(mac).filter(owner -> !owner.getId().equals(deviceSetId))
                .ifPresent(owner -> {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "MAC address belongs to another set");
                });

        if (set.getZone().getId().equals(zone.getId()) && set.getMacAddress().equals(mac)
                && set.getInstallationLabel().equals(label)) {
            return responseFor(set);
        }
        // Backfill a baseline for an older installation before changing its metadata.
        initializeHistory(set);
        set.setZone(zone);
        set.setMacAddress(mac);
        set.setInstallationLabel(label);
        sensors.forEach(sensor -> sensor.setZone(zone));
        try {
            deviceSetRepository.flush();
        } catch (DataIntegrityViolationException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "MAC address is already registered", error);
        }
        appendHistory(set);
        return responseFor(set);
    }

    @Transactional(readOnly = true)
    public List<DeviceSetHistoryResponse> history(Long deviceSetId) {
        if (!deviceSetRepository.existsById(deviceSetId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Device set not found");
        }
        return historyRepository.findByDeviceSetIdOrderByIdDesc(deviceSetId).stream()
                .map(entry -> DeviceSetHistoryResponse.builder()
                        .historyId(entry.getId()).deviceSetId(deviceSetId)
                        .setCode(entry.getSetCode()).macAddress(entry.getMacAddress())
                        .zoneId(entry.getZone().getId()).zoneName(entry.getZoneName())
                        .installationLabel(entry.getInstallationLabel()).changedAt(entry.getChangedAt()).build())
                .toList();
    }

    private void initializeHistory(DeviceSet set) {
        DeviceSetHistory history = historyRepository.findFirstByDeviceSetIdOrderByIdDesc(set.getId())
                .orElseGet(() -> appendHistory(set));
        rawRepository.linkUnassignedHistory(set.getId(), history);
        alertRepository.linkUnassignedHistory(set.getId(), history.getZone().getId(), history);
    }

    private DeviceSetHistory appendHistory(DeviceSet set) {
        return historyRepository.saveAndFlush(DeviceSetHistory.builder()
                .deviceSet(set).zone(set.getZone()).zoneName(set.getZone().getName())
                .setCode(set.getSetCode()).macAddress(set.getMacAddress())
                .installationLabel(set.getInstallationLabel())
                .changedAt(LocalDateTime.now(ZoneOffset.UTC)).build());
    }

    @Transactional(readOnly = true)
    public DeviceSetResponse configurationFor(String macAddress) {
        DeviceSet set = deviceSetRepository.findByMacAddress(normalizeMac(macAddress))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Register this ESP32 MAC address first"));
        return responseFor(set);
    }

    @Transactional(readOnly = true)
    public List<DeviceSetResponse> list() {
        return deviceSetRepository.findAllByOrderByIdAsc().stream().map(this::responseFor).toList();
    }

    private DeviceSetResponse responseFor(DeviceSet set) {
        Map<SensorModel, Long> ids = new EnumMap<>(SensorModel.class);
        for (Sensor sensor : sensorRepository.findByDeviceSetIdOrderByIdAsc(set.getId())) {
            ids.put(sensor.getSensorModel(), sensor.getId());
        }
        return DeviceSetResponse.builder()
                .deviceSetId(set.getId()).setCode(set.getSetCode()).macAddress(set.getMacAddress())
                .zoneId(set.getZone().getId()).zoneName(set.getZone().getName())
                .installationLabel(set.getInstallationLabel()).sensorIds(ids).build();
    }

    private String normalizeMac(String mac) {
        if (mac == null || !mac.matches("[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid ESP32 MAC address");
        }
        return mac.toUpperCase(Locale.ROOT);
    }
}
