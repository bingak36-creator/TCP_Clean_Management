package com.tcp.cleanmanagement.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "sensor_data_raw")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SensorDataRaw {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sensor_id")
    private Sensor sensor;

    private Float value1;
    private Float value2;
    private LocalDateTime measuredAt;
}
