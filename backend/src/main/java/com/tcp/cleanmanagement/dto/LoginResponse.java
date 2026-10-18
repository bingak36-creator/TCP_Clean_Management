package com.tcp.cleanmanagement.dto;

import com.tcp.cleanmanagement.enums.Role;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoginResponse {
    private String token;
    private java.time.OffsetDateTime expiresAt;
    private Long id;
    private String username;
    private Role role;
    private java.util.List<Long> zoneIds;
}
