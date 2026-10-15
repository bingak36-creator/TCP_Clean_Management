package com.tcp.cleanmanagement.entity;

import com.tcp.cleanmanagement.enums.MetricCode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "sensor_metrics", uniqueConstraints =
        @UniqueConstraint(name = "uq_metric_sensor_code", columnNames = {"sensor_id", "metric_code"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SensorMetric {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sensor_id", nullable = false)
    private Sensor sensor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private MetricCode metricCode;

    @Column(nullable = false, length = 24)
    private String unitCode;

    @Column(precision = 18, scale = 6)
    private BigDecimal pleasantThreshold;

    @Column(precision = 18, scale = 6)
    private BigDecimal needsVentilationThreshold;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
