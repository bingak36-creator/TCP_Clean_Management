package com.tcp.cleanmanagement.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "auth_sessions", indexes = @Index(name = "ix_auth_session_expiry", columnList = "expires_at"))
@Getter @NoArgsConstructor @AllArgsConstructor @Builder
public class AuthSession {
    // Only the SHA-256 digest is stored; the bearer credential is returned once at login.
    @Id @Column(length = 64) private String tokenHash;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false) private User user;
    @Column(nullable = false) private LocalDateTime createdAt;
    @Column(nullable = false) private LocalDateTime expiresAt;
}
