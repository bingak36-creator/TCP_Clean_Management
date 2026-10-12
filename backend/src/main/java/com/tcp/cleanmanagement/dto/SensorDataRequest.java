package com.tcp.cleanmanagement.dto;

import lombok.Data;
import java.util.List;

@Data
public class SensorDataRequest {
    private Float value1;
    private Float value2;

    // ESP32 전송 필드 호환
    private String macAddress;
    private String sampleKey;
    private List<MetricReading> readings;

    @Data
    public static class MetricReading {
        private String metricCode; // TEMPERATURE, HUMIDITY, GAS
        private Float measuredValue;
    }
}
