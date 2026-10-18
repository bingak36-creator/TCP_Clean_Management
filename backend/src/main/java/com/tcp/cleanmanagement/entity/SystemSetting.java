package com.tcp.cleanmanagement.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "system_settings")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SystemSetting {
    @Id
    @Column(length = 64)
    private String settingKey;

    @Column(nullable = false, length = 255)
    private String settingValue;

    @Column(length = 255)
    private String description;

    private Long updatedBy;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
