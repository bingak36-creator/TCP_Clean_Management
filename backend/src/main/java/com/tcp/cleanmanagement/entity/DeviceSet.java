package com.tcp.cleanmanagement.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "device_sets", uniqueConstraints = {
        @UniqueConstraint(name = "uq_device_set_code", columnNames = "set_code"),
        @UniqueConstraint(name = "uq_device_set_mac", columnNames = "mac_address")
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class DeviceSet {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 64)
    private String setCode;

    @Column(nullable = false, length = 17)
    private String macAddress;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "zone_id", nullable = false)
    private Zone zone;

    @Column(nullable = false, length = 100)
    private String installationLabel;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
