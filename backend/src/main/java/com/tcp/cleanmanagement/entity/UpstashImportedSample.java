package com.tcp.cleanmanagement.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "upstash_imported_samples", uniqueConstraints =
        @UniqueConstraint(name = "uq_upstash_device_sample", columnNames = {"mac_address", "sample_key"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class UpstashImportedSample {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "mac_address", nullable = false, length = 17)
    private String macAddress;

    @Column(name = "sample_key", nullable = false, length = 64)
    private String sampleKey;

    @Lob
    @Column(nullable = false, columnDefinition = "LONGTEXT")
    private String payload;

    @Column(nullable = false)
    private LocalDateTime measuredAt;

    @Column(nullable = false)
    private LocalDateTime importedAt;
}
