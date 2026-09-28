package com.tcp.cleanmanagement.entity;

import com.tcp.cleanmanagement.enums.SensorType;
import com.tcp.cleanmanagement.enums.SensorStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "sensors")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Sensor {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "zone_id")
    private Zone zone;

    @Enumerated(EnumType.STRING)
    private SensorType sensorType;

    @Enumerated(EnumType.STRING)
    private SensorStatus status;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
