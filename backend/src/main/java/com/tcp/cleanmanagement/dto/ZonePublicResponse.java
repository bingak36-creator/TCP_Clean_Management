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
}
