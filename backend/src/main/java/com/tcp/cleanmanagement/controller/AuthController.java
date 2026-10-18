package com.tcp.cleanmanagement.controller;

import com.tcp.cleanmanagement.dto.*;
import com.tcp.cleanmanagement.security.AuthPrincipal;
import com.tcp.cleanmanagement.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {
    private final AuthService auth;
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(auth.login(request));
    }
    @GetMapping("/me")
    public ResponseEntity<AuthPrincipal> me(HttpServletRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body((AuthPrincipal) request.getAttribute(AuthPrincipal.ATTRIBUTE));
    }
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestHeader("Authorization") String header) {
        auth.logout(header);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
}
