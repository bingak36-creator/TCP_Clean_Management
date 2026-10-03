package com.tcp.cleanmanagement.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class DeviceSetHistoryResponse {
    private Long historyId;
    private Long deviceSetId;
    private String setCode;
    private String macAddress;
    private Long zoneId;
    private String zoneName;
    private String installationLabel;
    private LocalDateTime changedAt;
}
