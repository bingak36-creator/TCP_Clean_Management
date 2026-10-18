package com.tcp.cleanmanagement.dto;

import com.tcp.cleanmanagement.enums.SensorModel;
import com.tcp.cleanmanagement.enums.SensorStatus;
import com.tcp.cleanmanagement.enums.SensorType;
import lombok.Data;

@Data
public class SensorCreateRequest {
    private Long zoneId;
    private SensorType sensorType;
    private SensorModel sensorModel;
    private SensorStatus status;
    private Float pleasantThreshold;
    private Float needsVentilationThreshold;
}
