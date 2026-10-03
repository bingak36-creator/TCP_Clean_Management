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
                .createdAt(alert.getCreatedAt())
                .build();
    }

    @Transactional
    public void resolveAlert(Long alertId, ActionRequest request) {
        Alert alert = alertRepository.findById(alertId)
                .orElseThrow(() -> new IllegalArgumentException("Invalid Alert ID"));
        
        alert.setStatus(AlertStatus.RESOLVED);
        alert.setResolvedAt(LocalDateTime.now());
        alertRepository.save(alert);

        // In a real app, User should be fetched using adminId from DB
        User mockAdmin = User.builder().id(request.getAdminId()).build(); 

        ActionLog log = ActionLog.builder()
                .alert(alert)
                .admin(mockAdmin)
                .actionDetail(request.getActionDetail())
                .build();
        actionLogRepository.save(log);
    }
}
