package com.tcp.cleanmanagement.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import java.time.Duration;
import java.time.Clock;
import java.util.HashMap;
import java.util.Map;

@Service
public class RateLimitService {
    private final StringRedisTemplate redisTemplate;
    private final boolean memory;
    private final Clock clock;
    @Value("${app.rate-limit.public-limit:10}") private int publicLimit=10;
    private final Map<String, Window> windows = new HashMap<>();

    @Autowired
    public RateLimitService(StringRedisTemplate redisTemplate, @Value("${app.rate-limit.store:redis}") String store) {
        this(redisTemplate, store, Clock.systemUTC());
    }

    RateLimitService(StringRedisTemplate redisTemplate, String store, Clock clock) {
        if (!store.equals("redis") && !store.equals("memory")) throw new IllegalArgumentException("Unknown rate limit store");
        this.redisTemplate = redisTemplate;
        this.memory = store.equals("memory");
        this.clock = clock;
    }

    public boolean isAllowed(String ipAddress) {
        if (memory) return memoryAllowed(ipAddress);
        String key = "rate_limit:" + ipAddress;
        Long count = redisTemplate.opsForValue().increment(key);
        
        if (count != null && count == 1) {
            redisTemplate.expire(key, Duration.ofMinutes(1)); // 1분 제한
        }
        
        return count != null && count <= publicLimit; // 1분당 10회
    }

    /** One-process development mode, preserving the existing 10 requests/minute limit. */
    private synchronized boolean memoryAllowed(String ipAddress) {
        long now = clock.millis();
        windows.values().removeIf(window -> window.expiresAt <= now);
        Window window = windows.get(ipAddress);
        if (window == null) {
            if (windows.size() >= 10000) return false;
            window = new Window(now + 60000);
            windows.put(ipAddress, window);
        }
        return ++window.count <= publicLimit;
    }

    private static class Window {
        final long expiresAt;
        int count;
        Window(long expiresAt) { this.expiresAt = expiresAt; }
    }
}
