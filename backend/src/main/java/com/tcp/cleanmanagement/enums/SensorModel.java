package com.tcp.cleanmanagement.enums;

public enum SensorModel {
    DHT22, MQ135, MQ7;

    public SensorType sensorType() {
        return this == DHT22 ? SensorType.TEMP_HUMID : SensorType.GAS;
    }
}
