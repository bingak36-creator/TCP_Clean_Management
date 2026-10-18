package com.tcp.cleanmanagement.service;
import com.tcp.cleanmanagement.dto.DiscoveredDeviceResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.time.*;
import java.util.*;
/** Unverified enrollment hints only. No credentials, sensor IDs or configuration are exposed. */
@Service @RequiredArgsConstructor
public class DiscoveredDeviceService {
    private final com.tcp.cleanmanagement.repository.DeviceSetRepository sets;
    private final com.tcp.cleanmanagement.repository.UpstashDeviceRepository devices;
    private final Map<String,DiscoveredDeviceResponse> pending=new LinkedHashMap<>();
    private static final int MAX_DEVICES=512;
    public synchronized void record(String value,String ip,Double lat,Double lon) {
        String mac=value.toUpperCase(Locale.ROOT);
        if(sets.findByMacAddress(mac).isPresent() || devices.existsById(mac)) {pending.remove(mac);return;}
        LocalDateTime now=LocalDateTime.now(ZoneOffset.UTC);
        expire(now);
        var row=pending.get(mac);
        if(row==null) {
            if(pending.size()>=MAX_DEVICES)pending.remove(pending.keySet().iterator().next());
            row=DiscoveredDeviceResponse.builder().macAddress(mac).firstSeenAt(now).requestCount(0).build();
            pending.put(mac,row);
        }
        row.setLastSeenAt(now);row.setIpAddress(ip);row.setRequestCount(row.getRequestCount()+1);
        if(lat!=null && lon!=null){row.setLatitude(lat);row.setLongitude(lon);}
    }
    public synchronized List<DiscoveredDeviceResponse> list() {
        expire(LocalDateTime.now(ZoneOffset.UTC));
        pending.keySet().removeIf(mac->sets.findByMacAddress(mac).isPresent()||devices.existsById(mac));
        return pending.values().stream().sorted(Comparator.comparing(DiscoveredDeviceResponse::getLastSeenAt).reversed())
            .map(r->DiscoveredDeviceResponse.builder().macAddress(r.getMacAddress()).ipAddress(r.getIpAddress())
                .firstSeenAt(r.getFirstSeenAt()).lastSeenAt(r.getLastSeenAt()).requestCount(r.getRequestCount())
                .latitude(r.getLatitude()).longitude(r.getLongitude()).build()).toList();
    }
    public synchronized void remove(String mac){pending.remove(mac.toUpperCase(Locale.ROOT));}
    private void expire(LocalDateTime now){pending.values().removeIf(row->row.getLastSeenAt().isBefore(now.minusHours(24)));}
}
