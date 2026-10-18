package com.tcp.cleanmanagement.entity;

import com.tcp.cleanmanagement.enums.ZoneType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "zones")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Zone {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private String address;
    @Column(length=8) private String floor;
    @Column(length=8) private String gender;
    private Double latitude;
    private Double longitude;

    @Enumerated(EnumType.STRING)
    private ZoneType zoneType;

    private Boolean isOurSolution;
    @Builder.Default
    private Boolean isActive = true;
    private Float pleasantThreshold;
    private Float needsVentilationThreshold;

    private Long assignedWorkerId;
    @Column(length = 50)
    private String assignedWorkerName;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
