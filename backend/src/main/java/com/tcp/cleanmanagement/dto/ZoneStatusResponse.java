package com.tcp.cleanmanagement.dto;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ZoneStatusResponse {
    private Long zoneId;
    private String name;
    private String status; // NORMAL, WARN, DANGER, UNKNOWN, NO_DATA, STALE, INACTIVE
    private String statusMessage;
}
