package com.tcp.cleanmanagement.service;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.time.Clock;
import java.util.*;
@Service
public class TrafficLimitService {
    private final StringRedisTemplate redis; private final boolean memory;
    private final Clock clock; private final Map<String,Window> windows=new HashMap<>();
    private static final DefaultRedisScript<Long> COUNT=new DefaultRedisScript<>(
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",Long.class);
    @org.springframework.beans.factory.annotation.Autowired
    public TrafficLimitService(StringRedisTemplate redis,@Value("${app.rate-limit.store:redis}") String store){this(redis,store,Clock.systemUTC());}
    public TrafficLimitService(StringRedisTemplate redis,String store,Clock clock){this.redis=redis;this.memory="memory".equals(store);this.clock=clock;}
    public void check(String scope,String identity,int limit,int seconds){
        if(limit<1 || seconds<1) throw new IllegalStateException("Rate limits must be positive");
        String key="tcp:traffic:"+scope+":"+AuthService.hash(identity);
        boolean allowed;
        try {
            if(memory) allowed=memory(key,limit,seconds);
            else {Long count=redis.execute(COUNT,List.of(key),Integer.toString(seconds));allowed=count!=null && count<=limit;}
        }catch(RuntimeException error){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Request limiting unavailable");}
        if(!allowed) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Too many requests. Try again later.");
    }
    private synchronized boolean memory(String key,int limit,int seconds){
        long now=clock.millis(); windows.values().removeIf(w->w.until<=now);
        Window current=windows.get(key);
        if(current==null){if(windows.size()>=10000)return false;current=new Window(now+seconds*1000L);windows.put(key,current);}
        return ++current.count<=limit;
    }
    private static class Window{final long until;int count;Window(long until){this.until=until;}}
}
