package com.tcp.cleanmanagement.config;

import com.tcp.cleanmanagement.interceptor.JwtAuthInterceptor;
import com.tcp.cleanmanagement.interceptor.RateLimitInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {
    private final RateLimitInterceptor rateLimitInterceptor;
    private final JwtAuthInterceptor jwtAuthInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // Apply Rate Limiting to Public APIs
        registry.addInterceptor(rateLimitInterceptor)
                .addPathPatterns("/api/public/**");
                
        // Apply JWT Auth to Admin APIs
        registry.addInterceptor(jwtAuthInterceptor)
                .addPathPatterns("/api/admin/**");
    }
}
