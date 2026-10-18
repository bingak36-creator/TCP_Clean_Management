package com.tcp.cleanmanagement.controller;
import com.tcp.cleanmanagement.dto.UpstashSample;
import com.tcp.cleanmanagement.service.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.Map;
@RestController @RequestMapping("/api/iot/esp32") @RequiredArgsConstructor
public class DirectEsp32Controller {
    private final UpstashImportService importer; private final JsonMapper mapper; private final DeviceCredentialService credentials;
    @PostMapping(consumes="application/json") public ResponseEntity<Map<String,Object>> receive(
        @RequestHeader(value="X-Device-Key",required=false) String key,@RequestHeader(value="X-Device-Mac",required=false) String mac,@RequestBody String payload){
        var identity=credentials.authenticate(mac,key);
        if(payload.length()>8192) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Packet too large");
        UpstashSample sample;
        try {
            sample=mapper.readValue(payload,UpstashSample.class);
            if(!identity.macAddress().equalsIgnoreCase(sample.macAddress())) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Packet MAC differs from authenticated device");
            if(sample.measuredAt()==null || OffsetDateTime.parse(sample.measuredAt()).toInstant().isAfter(Instant.now().plusSeconds(300))) throw new IllegalArgumentException();
        }catch(ResponseStatusException error){throw error;}catch(RuntimeException error){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid ESP32 packet");}
        boolean inserted;
        try {inserted=importer.receiveDirectSample(payload);}catch(IllegalArgumentException error){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid ESP32 packet");}
        return ResponseEntity.status(inserted?HttpStatus.CREATED:HttpStatus.OK).body(Map.of("stored",true,"duplicate",!inserted,"sampleKey",sample.sampleKey(),"destination","mysql"));
    }
}
