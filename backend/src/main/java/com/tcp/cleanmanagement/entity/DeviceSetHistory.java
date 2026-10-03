package com.tcp.cleanmanagement.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "device_set_history", indexes =
        @Index(name = "ix_set_history_set_id", columnList = "device_set_id,id"))
@Getter @NoArgsConstructor @AllArgsConstructor @Builder
public class DeviceSetHistory {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "device_set_id", nullable = false, updatable = false)
    private DeviceSet deviceSet;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "zone_id", nullable = false, updatable = false)
    private Zone zone;

    @Column(length = 255, updatable = false)
    private String zoneName;

    @Column(nullable = false, length = 64, updatable = false)
    private String setCode;

    @Column(nullable = false, length = 17, updatable = false)
    private String macAddress;

    @Column(nullable = false, length = 100, updatable = false)
    private String installationLabel;

    @Column(nullable = false, updatable = false)
    private LocalDateTime changedAt;
}
