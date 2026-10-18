package com.tcp.cleanmanagement.entity;

import com.tcp.cleanmanagement.enums.AiPredictionStatus;
import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "ai_predictions", indexes = {
        @Index(name = "ix_ai_work", columnList = "status,next_attempt_at,measured_at"),
        @Index(name = "ix_ai_sensor_time", columnList = "sensor_id,measured_at,id"),
        @Index(name = "ix_ai_device_time", columnList = "device_id,measured_at,id")})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class AiPrediction {
    // The source gas reading ID is also the idempotency key. No FK: raw data expires after 7 days.
    @Id private Long id;
    @Version private Long version;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sensor_id", nullable = false)
    private Sensor sensor;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "zone_id", nullable = false)
    private Zone zone;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "device_set_history_id")
    private DeviceSetHistory deviceSetHistory;
    @Column(nullable = false, length = 64) private String sampleKey;
    @Column(length = 128) private String deviceId;
    @Column(length = 8) private String sensorModel;
    @Column(nullable = false) private LocalDateTime measuredAt;
    @Column(nullable = false) private LocalDateTime queuedAt;
    @Column(nullable = false, precision = 18, scale = 6) private BigDecimal gasValue;
    @Column(precision = 18, scale = 6) private BigDecimal temperature;
    @Column(precision = 18, scale = 6) private BigDecimal humidity;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16)
    private AiPredictionStatus status;
    @Column(nullable = false) private int attempts;
    @Column(nullable = false) private LocalDateTime nextAttemptAt;
    @Column(length = 32) private String level;
    @Column(length = 255) private String headline;
    @Column(length = 64) private String modelVersion;
    @Column(length = 255) private String error;
    private LocalDateTime predictedAt;
    @Lob @Column(columnDefinition = "LONGTEXT") private String resultJson;
}
