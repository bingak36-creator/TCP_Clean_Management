package com.tcp.cleanmanagement.entity;

import com.tcp.cleanmanagement.enums.AlertType;
import com.tcp.cleanmanagement.enums.AlertStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "alerts")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Alert {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "zone_id")
    private Zone zone;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sensor_id")
    private Sensor sensor;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "device_set_history_id")
    private DeviceSetHistory deviceSetHistory;

    @Enumerated(EnumType.STRING)
    private AlertType alertType;

    private String message;

    @Enumerated(EnumType.STRING)
    private AlertStatus status;

    @CreationTimestamp
    private LocalDateTime createdAt;
    
    private LocalDateTime resolvedAt;
}
