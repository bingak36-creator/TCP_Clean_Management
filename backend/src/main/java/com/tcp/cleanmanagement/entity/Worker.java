package com.tcp.cleanmanagement.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "workers")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Worker {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(nullable = false, length = 20)
    private String phone;

    private Long assignedZoneId;

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String status = "AVAILABLE"; // AVAILABLE, DISPATCHED, OFF_DUTY

    @Column(nullable = false, length = 30)
    @Builder.Default
    private String role = "CLEANER";

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
