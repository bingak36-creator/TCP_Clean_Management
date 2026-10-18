package com.tcp.cleanmanagement.entity;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
@Entity @Table(name="device_credentials") @Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class DeviceCredential {
    @Id @Column(length=17) private String macAddress;
    @Column(nullable=false,length=64) private String keyHash;
    @Column(nullable=false) private boolean enabled;
    @Column(nullable=false) private LocalDateTime rotatedAt;
    @Column(nullable=false) private Long rotatedBy;
}
