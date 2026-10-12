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

    private double lastScore;
}
