package com.tcp.cleanmanagement.service;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.enums.*;
import com.tcp.cleanmanagement.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
@Service @RequiredArgsConstructor
public class SensorViewService {
    private final DeviceSetRepository sets; private final UpstashDeviceRepository devices;
    private final SensorDataRawRepository readings; private final OperationalSettingsService settings;
    private Map<String,Zone> registry() {
        Map<String,Zone> result=new TreeMap<>();
        devices.findAll().stream().filter(UpstashDevice::currentBinding).forEach(d->result.put(d.getMacAddress(),d.getZone()));
        sets.findAllByOrderByIdAsc().forEach(d->result.put(d.getMacAddress(),d.getZone()));
        return result;
    }
    @Transactional(readOnly=true) public Long zoneId(String mac) { return zone(mac).getId(); }
    private Zone zone(String mac){var zone=registry().get(normalize(mac)); if(zone==null) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Device not found"); return zone;}
    @Transactional(readOnly=true)
    public List<Snapshot> snapshots(String source) {
        validateSource(source); int offline=settings.offlineSeconds();
        return registry().entrySet().stream().map(entry->{
            String mac=entry.getKey(); Zone zone=entry.getValue();
            var keys=readings.currentSampleKeys(mac,zone.getId(),LocalDateTime.of(1970,1,1,0,0),PageRequest.of(0,1));
            var rows=keys.isEmpty()?List.<SensorDataRaw>of():readings.currentReadings(mac,zone.getId(),keys);
            Point point=rows.isEmpty()?null:point(rows);
            Instant received=rows.stream().map(SensorDataRaw::getReceivedAt).filter(Objects::nonNull).max(Comparator.naturalOrder()).map(t->t.toInstant(ZoneOffset.UTC)).orElse(null);
            Instant at=point==null?null:point.measuredAt();
            boolean active=!Boolean.FALSE.equals(zone.getIsActive());
            boolean stale=at==null || at.isBefore(Instant.now().minusSeconds(offline));
            return new Snapshot(zone.getId(),mac,zone.getName(),zone.getLatitude(),zone.getLongitude(),
                point==null?null:point.temperatureC(),point==null?null:point.humidityPercent(),point==null?null:point.mq135Adc(),point==null?null:point.mq7Adc(),
                at,received,source,rows.isEmpty()?null:rows.get(0).getIngestSource(),stale,active);
        }).toList();
    }
    @Transactional(readOnly=true)
    public List<Point> history(String mac,String source,int hours,int limit) { return history(mac,source,hours,limit,null); }
    @Transactional(readOnly=true)
    public List<Point> history(String mac,String source,int hours,int limit,Set<Long> allowedZones) {
        validateSource(source); mac=normalize(mac);
        if(hours<1||hours>168||limit<1||limit>1000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid history parameters");
        zone(mac); LocalDateTime from=LocalDateTime.now(ZoneOffset.UTC).minusHours(hours);
        List<SensorDataRaw> rows;
        if(allowedZones==null)rows=rows(mac,from,limit);
        else if(allowedZones.isEmpty())rows=List.of();
        else {
            var keys=readings.authorizedSampleKeys(mac,allowedZones,from,PageRequest.of(0,limit));
            rows=keys.isEmpty()?List.of():readings.findByDeviceMacAndSampleKeyIn(mac,keys).stream()
                .filter(r->allowedZones.contains(r.getDeviceSetHistory()!=null?r.getDeviceSetHistory().getZone().getId():r.getMetric().getSensor().getZone().getId())).toList();
        }
        Map<String,List<SensorDataRaw>> packets=new HashMap<>();
        rows.forEach(r->packets.computeIfAbsent(r.getSampleKey(),key->new ArrayList<>()).add(r));
        return packets.values().stream().map(this::point).sorted(Comparator.comparing(Point::measuredAt).thenComparing(Point::sampleKey)).toList();
    }
    private List<SensorDataRaw> rows(String mac,LocalDateTime from,int limit) {
        var keys=readings.recentSampleKeys(mac,from,PageRequest.of(0,limit));
        return keys.isEmpty()?List.of():readings.findByDeviceMacAndSampleKeyIn(mac,keys);
    }
    private Point point(List<SensorDataRaw> rows) {
        BigDecimal temp=null,humidity=null,gas=null,mq7=null;
        Instant at=rows.stream().map(SensorDataRaw::getMeasuredAt).max(Comparator.naturalOrder()).orElseThrow().toInstant(ZoneOffset.UTC);
        for(var row:rows){
            MetricCode metric=row.getMetric().getMetricCode();
            if(metric==MetricCode.TEMPERATURE) temp=row.getMeasuredValue();
            if(metric==MetricCode.HUMIDITY) humidity=row.getMeasuredValue();
            if(metric==MetricCode.GAS && row.getMetric().getSensor().getSensorModel()==SensorModel.MQ7) mq7=row.getMeasuredValue();
            else if(metric==MetricCode.GAS) gas=row.getMeasuredValue();
        }
        return new Point(rows.get(0).getSampleKey(),at,temp,humidity,gas,mq7);
    }
    private String normalize(String mac){if(mac==null || !mac.matches("(?i)([0-9a-f]{2}:){5}[0-9a-f]{2}")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid MAC"); return mac.toUpperCase(Locale.ROOT);}
    private void validateSource(String source){if(!"mysql".equals(source)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Only MySQL data access is supported");}
    public record Point(String sampleKey,Instant measuredAt,BigDecimal temperatureC,BigDecimal humidityPercent,BigDecimal mq135Adc,BigDecimal mq7Adc) {}
    public record Snapshot(Long zoneId,String macAddress,String name,Double latitude,Double longitude,BigDecimal temperatureC,BigDecimal humidityPercent,
        BigDecimal mq135Adc,BigDecimal mq7Adc,Instant measuredAt,Instant importedAt,String source,String ingestSource,boolean stale,boolean active) {}
}
