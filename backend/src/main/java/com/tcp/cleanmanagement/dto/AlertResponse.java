package com.tcp.cleanmanagement.dto;
import com.tcp.cleanmanagement.enums.AlertType;
import lombok.Builder;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Builder
public class AlertResponse {
    private Long alertId;
    private Long zoneId;
    private String zoneName;
    private AlertType alertType;
    private String message;
    private LocalDateTime createdAt;
}
