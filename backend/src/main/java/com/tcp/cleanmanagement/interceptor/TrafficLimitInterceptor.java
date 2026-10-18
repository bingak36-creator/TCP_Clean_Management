package com.tcp.cleanmanagement.interceptor;
import com.tcp.cleanmanagement.service.TrafficLimitService;
import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
@Component
public class TrafficLimitInterceptor implements HandlerInterceptor {
    // Many ESP32s share one NAT address; each device is also limited per MAC in DeviceAuthInterceptor.
    private final TrafficLimitService limits; private final int loginLimit,iotIpLimit;
    public TrafficLimitInterceptor(TrafficLimitService limits,@Value("${app.traffic.login-limit:10}") int loginLimit,@Value("${app.traffic.iot-ip-limit:1200}") int iotIpLimit){this.limits=limits;this.loginLimit=loginLimit;this.iotIpLimit=iotIpLimit;}
    @Override public boolean preHandle(HttpServletRequest request,HttpServletResponse response,Object handler){
        if("OPTIONS".equalsIgnoreCase(request.getMethod()))return true;
        boolean login=handler instanceof org.springframework.web.method.HandlerMethod method && com.tcp.cleanmanagement.controller.AuthController.class.isAssignableFrom(method.getBeanType());
        try{limits.check(login?"login-ip":"iot-ip",request.getRemoteAddr(),login?loginLimit:iotIpLimit,60);}
        catch(org.springframework.web.server.ResponseStatusException error){if(error.getStatusCode().value()==429)response.setHeader("Retry-After","60");throw error;}
        return true;
    }
}
