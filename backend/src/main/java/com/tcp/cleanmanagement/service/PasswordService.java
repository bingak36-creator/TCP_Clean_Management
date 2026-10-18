package com.tcp.cleanmanagement.service;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class PasswordService {
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(12);
    public String encode(String raw) { return encoder.encode(raw); }
    public boolean isEncoded(String stored) { return stored != null && stored.startsWith("$2"); }
    public boolean matches(String raw, String stored) {
        if (raw == null || stored == null) return false;
        if (isEncoded(stored)) {
            try { return encoder.matches(raw, stored); } catch (IllegalArgumentException invalidHash) { return false; }
        }
        // Existing plaintext rows are upgraded in the same transaction as successful login.
        return MessageDigest.isEqual(raw.getBytes(StandardCharsets.UTF_8), stored.getBytes(StandardCharsets.UTF_8));
    }
}
