package com.tcp.cleanmanagement.dto;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ZoneStatusResponse {
    private Long zoneId;
    private String name;
    private String status; // PLEASANT, NORMAL, NEEDS_VENTILATION
    private String statusMessage;
}
