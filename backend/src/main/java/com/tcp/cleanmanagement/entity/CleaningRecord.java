package com.tcp.cleanmanagement.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "cleaning_records")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CleaningRecord {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long zoneId;
    private Long createdBy;
    private String restroomName;
    private String worker;
    private String type;

    @Column(columnDefinition = "TEXT")
    private String memo;

    @CreationTimestamp
    private LocalDateTime createdAt;
}
