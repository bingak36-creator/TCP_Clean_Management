package com.tcp.cleanmanagement.service;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import java.time.Clock;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RateLimitServiceTest {
    @Test
    void memoryModeEnforcesPerIpLimitAndResetsAfterOneMinuteWithoutRedis() {
        var redis = mock(StringRedisTemplate.class);
        var clock = mock(Clock.class);
        when(clock.millis()).thenReturn(1000L);
        var limiter = new RateLimitService(redis, "memory", clock);
        for (int i = 0; i < 10; i++) assertTrue(limiter.isAllowed("192.168.0.5"));
        assertFalse(limiter.isAllowed("192.168.0.5"));
        assertTrue(limiter.isAllowed("192.168.0.8"));
        when(clock.millis()).thenReturn(61000L);
        assertTrue(limiter.isAllowed("192.168.0.5"));
        verifyNoInteractions(redis);
    }
}
