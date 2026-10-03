package com.tcp.cleanmanagement.entity;

import com.tcp.cleanmanagement.enums.SensorType;
import com.tcp.cleanmanagement.enums.SensorStatus;
import com.tcp.cleanmanagement.enums.SensorModel;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "sensors", uniqueConstraints =
        @UniqueConstraint(name = "uq_sensor_set_model", columnNames = {"device_set_id", "sensor_model"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Sensor {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "zone_id")
    private Zone zone;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "device_set_id")
    private DeviceSet deviceSet;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private SensorModel sensorModel;

    @Enumerated(EnumType.STRING)
    private SensorType sensorType;

    @Enumerated(EnumType.STRING)
    private SensorStatus status;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
