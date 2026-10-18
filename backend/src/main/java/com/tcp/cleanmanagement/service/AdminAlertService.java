package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.ActionRequest;
import com.tcp.cleanmanagement.dto.AlertResponse;
import com.tcp.cleanmanagement.entity.ActionLog;
import com.tcp.cleanmanagement.entity.Alert;
import com.tcp.cleanmanagement.entity.User;
import com.tcp.cleanmanagement.entity.DeviceSet;
import com.tcp.cleanmanagement.entity.DeviceSetHistory;
import com.tcp.cleanmanagement.enums.AlertStatus;
import com.tcp.cleanmanagement.repository.ActionLogRepository;
import com.tcp.cleanmanagement.repository.AlertRepository;
// import com.tcp.cleanmanagement.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AdminAlertService {
    private final AlertRepository alertRepository;
    private final ActionLogRepository actionLogRepository;

    @Transactional(readOnly = true)
    public List<AlertResponse> getUnresolvedAlerts() {
        return alertRepository.findByStatus(AlertStatus.UNRESOLVED).stream()
            .map(this::responseFor)
            .collect(Collectors.toList());
    }

    @Transactional(readOnly=true)
    public List<AlertResponse> getAlerts(String status) {
        List<Alert> rows;
        if("ALL".equals(status)) rows=alertRepository.findAll();
        else {
            try { rows=alertRepository.findByStatus(AlertStatus.valueOf(status)); }
            catch(IllegalArgumentException error){throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"Invalid alert status");}
        }
        return rows.stream().sorted(java.util.Comparator.comparing(Alert::getCreatedAt).reversed()).map(this::responseFor).toList();
    }
    private AlertResponse responseFor(Alert alert) {
        DeviceSetHistory history = alert.getDeviceSetHistory();
        DeviceSet set = history != null ? history.getDeviceSet()
                : alert.getSensor() == null ? null : alert.getSensor().getDeviceSet();
        return AlertResponse.builder()
                .alertId(alert.getId())
                .zoneId(alert.getZone().getId())
                .zoneName(history == null ? alert.getZone().getName() : history.getZoneName())
                .sensorId(alert.getSensor() == null ? null : alert.getSensor().getId())
                .sensorModel(alert.getSensor() == null ? null : alert.getSensor().getSensorModel())
                .deviceSetId(set == null ? null : set.getId())
                .deviceSetHistoryId(history == null ? null : history.getId())
                .setCode(history != null ? history.getSetCode() : set == null ? null : set.getSetCode())
                .installationLabel(history != null ? history.getInstallationLabel()
                        : set == null ? null : set.getInstallationLabel())
                .alertType(alert.getAlertType())
                .message(alert.getMessage())
                .detectionSource(alert.getDetectionSource())
                .modelVersion(alert.getModelVersion())
                .level(alert.getLevel())
                .createdAt(alert.getCreatedAt()).status(alert.getStatus()).resolvedAt(alert.getResolvedAt()).resolutionSource(alert.getResolutionSource())
                .build();
    }

    @Transactional
    public void resolveAlert(Long alertId, ActionRequest request) {
        Alert alert = alertRepository.findByIdForUpdate(alertId)
                .orElseThrow(() -> new IllegalArgumentException("Invalid Alert ID"));

        if(alert.getStatus()==AlertStatus.RESOLVED)return;
        alert.setStatus(AlertStatus.RESOLVED);
        alert.setResolutionSource("MANUAL");
        alert.setResolvedAt(LocalDateTime.now(java.time.ZoneOffset.UTC));
        alertRepository.save(alert);

        // Controller derives this foreign-key reference from the verified session.
        User actorReference = User.builder().id(request.getAdminId()).build();

        ActionLog log = ActionLog.builder()
                .alert(alert)
                .admin(actorReference)
                .actionDetail(request.getActionDetail())
                .build();
        actionLogRepository.save(log);
    }

    @Transactional(readOnly=true)
    public Long zoneId(Long id) { return alertRepository.findById(id).orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND)).getZone().getId(); }

    @Transactional
    public void resolveAllAlerts(ActionRequest request) { resolveAllAlerts(request, null); }

    @Transactional
    public void resolveAllAlerts(ActionRequest request, List<Long> allowedZones) {
        List<Alert> unresolved = alertRepository.findByStatus(AlertStatus.UNRESOLVED);
        for (Alert a : unresolved) {
            if (allowedZones == null || allowedZones.contains(a.getZone().getId())) resolveAlert(a.getId(), request);
        }
    }
}
