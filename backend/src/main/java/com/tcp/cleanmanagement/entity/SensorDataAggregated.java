package com.tcp.cleanmanagement.entity;

import com.tcp.cleanmanagement.enums.AggregationGranularity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "sensor_data_aggregated", uniqueConstraints =
        @UniqueConstraint(name = "uq_aggregate_bucket", columnNames = {"metric_id", "granularity", "bucket_start"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SensorDataAggregated {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "metric_id", nullable = false)
    private SensorMetric metric;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    private AggregationGranularity granularity;

    @Column(nullable = false)
    private LocalDateTime bucketStart;

    @Column(nullable = false)
    private Long sampleCount;

    @Column(nullable = false, precision = 28, scale = 6)
    private BigDecimal sumValue;

    @Column(nullable = false, precision = 20, scale = 8)
    private BigDecimal avgValue;

    @Column(nullable = false, precision = 18, scale = 6)
    private BigDecimal minValue;

    @Column(nullable = false, precision = 18, scale = 6)
    private BigDecimal maxValue;

    @Column(nullable = false)
    private LocalDateTime computedAt;
}
