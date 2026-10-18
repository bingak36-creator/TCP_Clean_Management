package com.tcp.cleanmanagement.service;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;
class TrafficLimitServiceTest {
    @Test void limitsExpireAndDoNotShareScopesOrIdentities(){
        var time=new AtomicLong(0);Clock clock=new Clock(){public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}public Instant instant(){return Instant.ofEpochMilli(time.get());}};
        var limiter=new TrafficLimitService(null,"memory",clock);
        limiter.check("login","ip-a",2,60);limiter.check("login","ip-a",2,60);
        assertEquals(429,assertThrows(ResponseStatusException.class,()->limiter.check("login","ip-a",2,60)).getStatusCode().value());
        limiter.check("login","ip-b",2,60);limiter.check("device","ip-a",2,60);
        time.set(60000);limiter.check("login","ip-a",2,60);
    }
    @Test void redisFailureFailsClosed(){
        var redis=org.mockito.Mockito.mock(org.springframework.data.redis.core.StringRedisTemplate.class);
        org.mockito.Mockito.when(redis.execute(org.mockito.ArgumentMatchers.any(org.springframework.data.redis.core.script.RedisScript.class),org.mockito.ArgumentMatchers.anyList(),org.mockito.ArgumentMatchers.anyString())).thenThrow(new IllegalStateException("unavailable"));
        var limiter=new TrafficLimitService(redis,"redis",Clock.systemUTC());
        assertEquals(503,assertThrows(ResponseStatusException.class,()->limiter.check("login","ip",2,60)).getStatusCode().value());
    }
}
