package com.tcp.cleanmanagement.entity;

import com.tcp.cleanmanagement.enums.TimeSource;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "sensor_data_raw", uniqueConstraints =
        @UniqueConstraint(name = "uq_raw_metric_sample", columnNames = {"metric_id", "sample_key"}), indexes = {
        @Index(name = "ix_raw_metric_time", columnList = "metric_id,measured_at,id"),
        @Index(name = "ix_raw_cleanup", columnList = "measured_at")
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SensorDataRaw {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "metric_id", nullable = false)
    private SensorMetric metric;

    @Column(nullable = false, length = 64)
    private String sampleKey;

    @Column(nullable = false, precision = 18, scale = 6)
    private BigDecimal measuredValue;

    @Column(nullable = false)
    private LocalDateTime measuredAt;

    @Column(nullable = false)
    private LocalDateTime receivedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private TimeSource timeSource;
}
