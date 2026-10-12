package com.tcp.cleanmanagement.dto;
import com.tcp.cleanmanagement.enums.SensorType;
import lombok.Data;

@Data
public class SensorCreateRequest {
    private Long zoneId;
    private SensorType sensorType;
}
