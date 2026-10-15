package com.tcp.cleanmanagement.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "upstash_imported_samples", uniqueConstraints =
        @UniqueConstraint(name = "uq_upstash_device_sample", columnNames = {"mac_address", "sample_key"}),
        indexes = @Index(name = "ix_upstash_device_time", columnList = "mac_address,measured_at,id"))
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

    @Builder.Default
    @Column(name = "ingest_source", nullable = false, columnDefinition = "varchar(16) default 'upstash'")
    private String ingestSource = "upstash";

    @Column(nullable = false)
    private LocalDateTime measuredAt;

    @Column(nullable = false)
    private LocalDateTime importedAt;
}
