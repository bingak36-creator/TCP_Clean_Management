package com.tcp.cleanmanagement.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ZonePublicResponse {
    private Long zoneId;
    private String name;
    private Double latitude;
    private Double longitude;
    private Boolean isOurSolution;
    
    // IoT Data
    private Float temp;
    private Float humidity;
    private Float gasLevel;
    
    // Status (e.g. "쾌적", "혼잡", "경고")
    private String status;
    private String color; // e.g. "#10b981"
}
