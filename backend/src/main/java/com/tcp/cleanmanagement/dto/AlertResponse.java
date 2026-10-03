package com.tcp.cleanmanagement.dto;
import com.tcp.cleanmanagement.enums.AlertType;
import com.tcp.cleanmanagement.enums.SensorModel;
import lombok.Builder;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Builder
public class AlertResponse {
    private Long alertId;
    private Long zoneId;
    private String zoneName;
    private Long sensorId;
    private SensorModel sensorModel;
    private Long deviceSetId;
    private Long deviceSetHistoryId;
    private String setCode;
    private String installationLabel;
    private AlertType alertType;
    private String message;
    private LocalDateTime createdAt;
}
