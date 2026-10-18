package com.tcp.cleanmanagement.service;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.repository.*;
import com.tcp.cleanmanagement.security.DeviceIdentity;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
@Service @RequiredArgsConstructor
public class DeviceCredentialService {
    private final DeviceCredentialRepository credentials; private final DeviceSetRepository sets;
    private final UpstashDeviceRepository devices; private final SensorRepository sensors;
    private final SecureRandom random=new SecureRandom();
    public record Metadata(String macAddress,boolean enabled,LocalDateTime rotatedAt,Long rotatedBy) {}
    public record Issued(String macAddress,String key,LocalDateTime rotatedAt) {}
    public String normalize(String mac) {
        if(mac==null || !mac.matches("(?i)([0-9a-f]{2}:){5}[0-9a-f]{2}")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid device MAC");
        return mac.toUpperCase(Locale.ROOT);
    }
    private void registered(String mac) { if(sets.findByMacAddress(mac).isEmpty() && devices.findById(mac).filter(UpstashDevice::currentBinding).isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Register the device first"); }
    @Transactional public Issued rotate(String value,Long actor) {
        String mac=normalize(value); registered(mac); byte[] bytes=new byte[32];random.nextBytes(bytes);
        String key=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); LocalDateTime now=LocalDateTime.now(ZoneOffset.UTC);
        credentials.saveAndFlush(DeviceCredential.builder().macAddress(mac).keyHash(AuthService.hash(key)).enabled(true).rotatedAt(now).rotatedBy(actor).build());
        return new Issued(mac,key,now);
    }
    @Transactional public void revoke(String value,Long actor) { String mac=normalize(value);credentials.findById(mac).ifPresent(row->{row.setEnabled(false);row.setRotatedBy(actor);row.setRotatedAt(LocalDateTime.now(ZoneOffset.UTC));}); }
    @Transactional(readOnly=true) public Metadata metadata(String value) {
        String mac=normalize(value);registered(mac);return credentials.findById(mac).map(r->new Metadata(mac,r.isEnabled(),r.getRotatedAt(),r.getRotatedBy())).orElse(new Metadata(mac,false,null,null));
    }
    @Transactional(readOnly=true) public DeviceIdentity authenticate(String mac,String key) {
        // Unknown, revoked, malformed and wrong keys all fail without revealing enrollment state.
        if(mac==null || !mac.matches("(?i)([0-9a-f]{2}:){5}[0-9a-f]{2}") || key==null || !key.matches("[A-Za-z0-9_-]{43}")) throw unauthorized();
        mac=mac.toUpperCase(Locale.ROOT);
        var row=credentials.findById(mac).filter(DeviceCredential::isEnabled).orElseThrow(DeviceCredentialService::unauthorized);
        if(!MessageDigest.isEqual(row.getKeyHash().getBytes(StandardCharsets.UTF_8),AuthService.hash(key).getBytes(StandardCharsets.UTF_8))) throw unauthorized();
        registered(mac);return new DeviceIdentity(mac);
    }
    @Transactional(readOnly=true) public void requireSensor(String mac,Long id) {
        var sensor=sensors.findById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Sensor not found"));
        boolean belongs=sensor.getDeviceSet()!=null && mac.equalsIgnoreCase(sensor.getDeviceSet().getMacAddress());
        if(!belongs && sets.findByMacAddress(mac).isEmpty()) belongs=devices.findById(mac).filter(UpstashDevice::currentBinding).map(d->d.getGasSensor().getId().equals(id)||d.getTemperatureHumiditySensor().getId().equals(id)||d.getMq7Sensor()!=null&&d.getMq7Sensor().getId().equals(id)).orElse(false);
        if(!belongs) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Sensor belongs to another device");
    }
    private static ResponseStatusException unauthorized(){return new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Invalid device credentials");}
}
