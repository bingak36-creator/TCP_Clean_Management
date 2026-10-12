package com.tcp.cleanmanagement.dto;

import lombok.Builder;
import lombok.Data;
import java.util.Map;

@Data
@Builder
public class DeviceSetResponse {
    private String macAddress;
    private String setCode;
    private Map<String, Long> sensorIds;
}
