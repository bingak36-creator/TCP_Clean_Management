package com.tcp.cleanmanagement.interceptor;
import com.tcp.cleanmanagement.service.DeviceCredentialService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class DeviceAuthInterceptorTest {
    private final DeviceCredentialService credentials=mock(DeviceCredentialService.class);
    @Test void missingCredentialsFailClosed(){
        when(credentials.authenticate(null,null)).thenThrow(new ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED));
        assertEquals(401,assertThrows(ResponseStatusException.class,()->new DeviceAuthInterceptor(credentials,mock(com.tcp.cleanmanagement.service.TrafficLimitService.class),120).preHandle(new MockHttpServletRequest("POST","/api/iot/1/data"),new MockHttpServletResponse(),new Object())).getStatusCode().value());
    }
    @Test void preflightDoesNotRequireDeviceCredentials(){
        assertTrue(new DeviceAuthInterceptor(credentials,mock(com.tcp.cleanmanagement.service.TrafficLimitService.class),120).preHandle(new MockHttpServletRequest("OPTIONS","/api/iot/1/data"),new MockHttpServletResponse(),new Object()));verifyNoInteractions(credentials);
    }
}
