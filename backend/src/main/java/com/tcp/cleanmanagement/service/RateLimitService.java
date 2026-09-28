package com.tcp.cleanmanagement.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import java.time.Duration;

@Service
@RequiredArgsConstructor
public class RateLimitService {
    private final StringRedisTemplate redisTemplate;

    public boolean isAllowed(String ipAddress) {
        String key = "rate_limit:" + ipAddress;
        Long count = redisTemplate.opsForValue().increment(key);
        
        if (count != null && count == 1) {
            redisTemplate.expire(key, Duration.ofMinutes(1)); // 1분 제한
        }
        
        return count != null && count <= 10; // 1분당 10회
    }
}
