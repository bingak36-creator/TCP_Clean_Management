package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.*;
import com.tcp.cleanmanagement.entity.AuthSession;
import com.tcp.cleanmanagement.repository.*;
import com.tcp.cleanmanagement.security.AuthPrincipal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;

@Service
public class AuthService {
    private final UserRepository users;
    private final AuthSessionRepository sessions;
    private final ZonePermissionRepository permissions;
    private final TrafficLimitService limits;
    private final int accountLimit;
    private final PasswordService passwords;
    private final SecureRandom random = new SecureRandom();
    private final long ttlSeconds;
    private final String dummyHash;

    public AuthService(UserRepository users, AuthSessionRepository sessions, ZonePermissionRepository permissions, PasswordService passwords, TrafficLimitService limits,
            @Value("${app.traffic.account-limit:10}") int accountLimit,
            @Value("${app.auth.session-ttl-seconds:28800}") long ttlSeconds) {
        if (ttlSeconds < 60 || ttlSeconds > 86400) throw new IllegalArgumentException("Session TTL must be 60..86400 seconds");
        this.users = users; this.sessions = sessions; this.permissions = permissions; this.limits=limits; this.accountLimit=accountLimit; this.passwords = passwords; this.ttlSeconds = ttlSeconds;
        this.dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    @Transactional
    public LoginResponse login(LoginRequest request) {
        if (request == null || request.getUsername() == null || request.getUsername().isBlank()
                || request.getUsername().length() > 255 || request.getPassword() == null || request.getPassword().isBlank()
                || request.getPassword().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "아이디와 비밀번호를 확인해주세요.");
        }
        limits.check("login-account",request.getUsername().trim().toLowerCase(Locale.ROOT),accountLimit,900);
        var found = users.findByUsername(request.getUsername().trim());
        boolean matches = passwords.matches(request.getPassword(), found.map(u -> u.getPassword()).orElse(dummyHash));
        if (!matches && found.isPresent() && !passwords.isEncoded(found.get().getPassword())) {
            passwords.matches(request.getPassword(), dummyHash);
        }
        if (found.isEmpty() || !matches) throw unauthorized();
        var user = found.get();
        if (!passwords.isEncoded(user.getPassword())) user.setPassword(passwords.encode(request.getPassword()));
        LocalDateTime now = now();
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        LocalDateTime expiresAt = now.plusSeconds(ttlSeconds);
        sessions.deleteExpired(now);
        sessions.save(AuthSession.builder().tokenHash(hash(token)).user(user).createdAt(now).expiresAt(expiresAt).build());
        return LoginResponse.builder().token(token).id(user.getId()).username(user.getUsername()).role(user.getRole())
                .zoneIds(zoneIds(user.getId())).expiresAt(expiresAt.atOffset(ZoneOffset.UTC)).build();
    }

    @Transactional(readOnly = true)
    public AuthPrincipal authenticate(String header) {
        String token = tokenFrom(header);
        var session = sessions.findByTokenHash(hash(token)).filter(s -> s.getExpiresAt().isAfter(now()))
                .orElseThrow(AuthService::unauthorized);
        var user = session.getUser();
        return new AuthPrincipal(user.getId(), user.getUsername(), user.getRole(), zoneIds(user.getId()));
    }

    @Transactional
    public void logout(String header) { sessions.deleteById(hash(tokenFrom(header))); }

    private List<Long> zoneIds(Long id) { return permissions.findByUserId(id).stream().filter(p -> p.getZone()!=null).map(p -> p.getZone().getId()).distinct().toList(); }

    private String tokenFrom(String header) {
        if (header == null || header.length() > 128 || !header.regionMatches(true, 0, "Bearer ", 0, 7)) throw unauthorized();
        String token = header.substring(7);
        if (!token.matches("[A-Za-z0-9_-]{43}")) throw unauthorized();
        return token;
    }
    public static String hash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
    private static ResponseStatusException unauthorized() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "아이디, 비밀번호 또는 세션이 유효하지 않습니다.");
    }
}
