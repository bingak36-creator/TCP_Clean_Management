package com.tcp.cleanmanagement.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "sensor_data_aggregated")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SensorDataAggregated {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sensor_id")
    private Sensor sensor;

    private Float avgValue1;
    private Float maxValue1;
    private Float avgValue2;
    private Float maxValue2;
    
    private LocalDateTime timeBucket;
}
