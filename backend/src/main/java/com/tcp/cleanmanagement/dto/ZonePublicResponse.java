package com.tcp.cleanmanagement.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ZonePublicResponse {
    private Long zoneId;
    private String name;
    private String address;
    private String floor;
    private String gender;
    private String zoneType;
    private Double latitude;
    private Double longitude;
    private Boolean isOurSolution;
    private Boolean isActive;
    private Float pleasantThreshold;
    private Float needsVentilationThreshold;
    
    // IoT Data
    private Float temp;
    private Float humidity;
    private Float gasLevel;
    private Float mq7Level;
    
    // Status (e.g. "쾌적", "혼잡", "경고")
    private String status;
    private String statusMessage;
    private Boolean stale;
    private java.time.OffsetDateTime measuredAt;
    private String color; // e.g. "#10b981"

    // 담당 청소관리인 및 최근 청소 정보
    private Long assignedWorkerId;
    private String assignedWorkerName;
    private String lastCleanedAt;
    private String lastCleanedWorker;
}
