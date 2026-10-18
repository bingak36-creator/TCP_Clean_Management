package com.tcp.cleanmanagement.security;
import com.tcp.cleanmanagement.enums.Role;
import java.util.List;
public record AuthPrincipal(Long id, String username, Role role, List<Long> zoneIds) {
    public static final String ATTRIBUTE = "tcp.auth.principal";
    public AuthPrincipal { zoneIds = List.copyOf(zoneIds); }
}
