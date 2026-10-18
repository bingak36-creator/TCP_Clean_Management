package com.tcp.cleanmanagement.config;

import com.tcp.cleanmanagement.interceptor.AuthInterceptor;
import com.tcp.cleanmanagement.interceptor.RateLimitInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {
    private final RateLimitInterceptor rateLimitInterceptor;
    private final com.tcp.cleanmanagement.interceptor.TrafficLimitInterceptor trafficLimitInterceptor;
    private final AuthInterceptor authInterceptor;
    private final com.tcp.cleanmanagement.interceptor.DeviceAuthInterceptor deviceAuthInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(trafficLimitInterceptor).addPathPatterns("/api/auth/login","/api/iot/discovery","/api/iot/esp32","/api/iot/sensors/**","/api/iot/device-sets/**","/api/iot/*/data");
        // Apply Rate Limiting to Public APIs
        registry.addInterceptor(rateLimitInterceptor)
                .addPathPatterns("/api/public/**","/api/kakao-transit");
                
        // Validate server-issued sessions for all management APIs
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/admin/**", "/api/dev/**", "/api/auth/me", "/api/auth/logout", "/api/iot/devices/**", "/api/iot/upstash/**");

        registry.addInterceptor(deviceAuthInterceptor)
                 .addPathPatterns("/api/iot/esp32", "/api/iot/device-sets/**", "/api/iot/sensors/**", "/api/iot/*/data");
    }

    @Override
    public void addCorsMappings(org.springframework.web.servlet.config.annotation.CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOriginPatterns("https://cleanmg.dothome.co.kr", "http://cleanmg.dothome.co.kr", "http://localhost:*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH")
                .allowedHeaders("*")
                .exposedHeaders("Authorization", "Content-Type")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
