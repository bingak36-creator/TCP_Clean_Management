package com.tcp.cleanmanagement.interceptor;

import com.tcp.cleanmanagement.security.AuthPrincipal;
import com.tcp.cleanmanagement.service.AuthService;
import jakarta.servlet.http.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.server.ResponseStatusException;

@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {
    private final AuthService auth;
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) return true;
        try {
            request.setAttribute(AuthPrincipal.ATTRIBUTE, auth.authenticate(request.getHeader("Authorization")));
            return true;
        } catch (ResponseStatusException invalid) {
            response.setHeader("WWW-Authenticate", "Bearer");
            throw invalid;
        }
    }
}
