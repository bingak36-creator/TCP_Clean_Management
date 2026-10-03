package com.tcp.cleanmanagement.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class DeviceSetResponse {
    private Long deviceSetId;
    private String setCode;
    private String macAddress;
    private Long zoneId;
    private String zoneName;
    private String installationLabel;
    private Map<?, Long> sensorIds;
}
