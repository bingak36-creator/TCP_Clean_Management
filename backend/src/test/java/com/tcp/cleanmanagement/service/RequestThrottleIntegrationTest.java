package com.tcp.cleanmanagement.service;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import java.net.*;
import java.net.http.*;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"spring.datasource.url=jdbc:h2:mem:request_limits;MODE=MySQL;DB_CLOSE_DELAY=-1","app.traffic.login-limit=2","app.traffic.device-limit=2","app.traffic.iot-ip-limit=2"})
class RequestThrottleIntegrationTest {
    @Autowired Environment env;
    @Test void repeatedBadCredentialsAndDeviceFloodsAreThrottledBeforeWrites() throws Exception {
        var client=HttpClient.newHttpClient();String base="http://127.0.0.1:"+env.getProperty("local.server.port");
        for(String path:new String[]{"/api/auth/login","/api/iot/esp32"}){
            String body=path.contains("login")?"{\"username\":\"unknown\",\"password\":\"incorrect-password\"}":"{}";
            for(int i=0;i<3;i++){
                var response=client.send(HttpRequest.newBuilder(URI.create(base+path+(i==2 && path.contains("login")?";attempt=3":""))).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
                assertEquals(i<2?401:429,response.statusCode(),response.body());if(i==2)assertEquals("60",response.headers().firstValue("Retry-After").orElseThrow());
            }
        }
    }
}
