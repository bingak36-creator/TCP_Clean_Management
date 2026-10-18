package com.tcp.cleanmanagement.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "upstash_devices")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class UpstashDevice {
    @Id
    @Column(length = 17)
    private String macAddress;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    private Zone zone;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    private Sensor temperatureHumiditySensor;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    private Sensor gasSensor;

    @ManyToOne(fetch=FetchType.LAZY)
    private Sensor mq7Sensor;

    private double lastScore;
    public boolean currentBinding() {
        return belongs(temperatureHumiditySensor)&&belongs(gasSensor)&&(mq7Sensor==null||belongs(mq7Sensor));
    }
    private boolean belongs(Sensor sensor) {
        return sensor!=null&&(sensor.getDeviceSet()==null||macAddress.equalsIgnoreCase(sensor.getDeviceSet().getMacAddress()));
    }
}
