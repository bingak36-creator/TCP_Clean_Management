package com.tcp.cleanmanagement.interceptor;
import com.tcp.cleanmanagement.security.DeviceIdentity;
import com.tcp.cleanmanagement.service.DeviceCredentialService;
import jakarta.servlet.http.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
@Component
public class DeviceAuthInterceptor implements HandlerInterceptor {
    private final DeviceCredentialService credentials;
    private final com.tcp.cleanmanagement.service.TrafficLimitService limits;
    private final int deviceLimit;
    public DeviceAuthInterceptor(DeviceCredentialService credentials,com.tcp.cleanmanagement.service.TrafficLimitService limits,
        @org.springframework.beans.factory.annotation.Value("${app.traffic.device-limit:120}") int deviceLimit){this.credentials=credentials;this.limits=limits;this.deviceLimit=deviceLimit;}
    @Override public boolean preHandle(HttpServletRequest request,HttpServletResponse response,Object handler){
        if("OPTIONS".equalsIgnoreCase(request.getMethod())) return true;
        var identity=credentials.authenticate(request.getHeader("X-Device-Mac"),request.getHeader("X-Device-Key"));
        limits.check("device",identity.macAddress(),deviceLimit,60);
        request.setAttribute(DeviceIdentity.ATTRIBUTE,identity);return true;
    }
}
