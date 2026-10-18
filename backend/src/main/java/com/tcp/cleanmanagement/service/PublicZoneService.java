package com.tcp.cleanmanagement.service;
import com.tcp.cleanmanagement.dto.*;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.enums.*;
import com.tcp.cleanmanagement.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.util.*;
@Service @RequiredArgsConstructor
public class PublicZoneService {
    private final ZoneRepository zoneRepository; private final SensorDataRawRepository sensorDataRawRepository;
    private final OperationalSettingsService settings;
    private final CleaningRecordRepository cleaning;
    @Transactional(readOnly=true)
    public List<ZonePublicResponse> getZones(ZoneType type,Double lat,Double lng,Double radius) {
        if((lat==null)!=(lng==null) || lat!=null && (!Double.isFinite(lat)||!Double.isFinite(lng)||lat< -90||lat>90||lng< -180||lng>180||radius==null||!Double.isFinite(radius)||radius<=0||radius>100))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid coordinates or radius");
        List<Zone> zones=lat!=null?(type==null?zoneRepository.findZonesWithinRadius(lat,lng,radius):zoneRepository.findZonesByTypeAndRadius(type.name(),lat,lng,radius))
            :(type==null?zoneRepository.findAll():zoneRepository.findByZoneType(type));
        var limits=settings.all();
        return zones.stream().filter(z->!Boolean.FALSE.equals(z.getIsActive())).map(z->{var item=response(z,limits);item.setName(publicName(item.getName()));return item;}).toList();
    }
    @Transactional(readOnly=true) public List<ZonePublicResponse> adminZones(){var limits=settings.all();return zoneRepository.findAll().stream().map(z->{
        var row=response(z,limits);row.setAssignedWorkerId(z.getAssignedWorkerId());row.setAssignedWorkerName(z.getAssignedWorkerName());
        cleaning.findFirstByZoneIdOrderByCreatedAtDescIdDesc(z.getId()).ifPresent(record->{
            row.setLastCleanedAt(record.getCreatedAt().atOffset(ZoneOffset.UTC).toString());row.setLastCleanedWorker(record.getWorker());
        });return row;
    }).toList();}
    private ZonePublicResponse response(Zone zone,Map<String,String> limits) {
        var gas=latestModel(zone.getId(),SensorModel.MQ135).or(()->latest(zone.getId(),MetricCode.GAS))
            .filter(r->r.getMetric()==null || r.getMetric().getSensor().getSensorModel()!=SensorModel.MQ7);
        var mq7=latestModel(zone.getId(),SensorModel.MQ7); var temp=latest(zone.getId(),MetricCode.TEMPERATURE); var hum=latest(zone.getId(),MetricCode.HUMIDITY);
        var all=java.util.stream.Stream.of(gas,temp,hum).flatMap(Optional::stream).toList();
        int offline=Integer.parseInt(limits.get("offline_timeout_seconds"));
        LocalDateTime cutoff=LocalDateTime.now(ZoneOffset.UTC).minusSeconds(offline);
        boolean stale=all.stream().anyMatch(r->r.getMeasuredAt()==null || r.getMeasuredAt().isBefore(cutoff));
        String status="NORMAL", message="현재 센서 경고 기준 이내입니다.", color="#10b981";
        if(Boolean.FALSE.equals(zone.getIsActive())) {status="INACTIVE";message="운영 중지된 구역입니다.";color="#9ca3af";}
        else if(all.isEmpty()){status="NO_DATA";message="측정 데이터가 없습니다.";color="#9ca3af";}
        else if(stale){status="STALE";message="센서 데이터가 오래되어 상태를 확인할 수 없습니다.";color="#9ca3af";}
        else {
            double gasWarn=zone.getPleasantThreshold()==null?Double.parseDouble(limits.get("gas_warning_threshold")):zone.getPleasantThreshold();
            double gasDanger=zone.getNeedsVentilationThreshold()==null?Double.parseDouble(limits.get("gas_danger_threshold")):zone.getNeedsVentilationThreshold();
            boolean danger=temp.isPresent() && temp.get().getMeasuredValue().signum()<0 || over(gas,gasDanger)||over(temp,Double.parseDouble(limits.get("temp_danger_threshold")))||over(hum,Double.parseDouble(limits.get("humidity_danger_threshold")));
            boolean warn=over(gas,gasWarn)||over(temp,Double.parseDouble(limits.get("temp_warning_threshold")))||over(hum,Double.parseDouble(limits.get("humidity_warning_threshold")));
            if(danger){status="DANGER";message="센서 위험 기준을 초과했습니다.";color="#ef4444";}
            else if(warn){status="WARN";message="센서 주의 기준을 초과했습니다.";color="#f59e0b";}
            else if(gas.isEmpty()||temp.isEmpty()||hum.isEmpty()){status="UNKNOWN";message="일부 센서 측정값이 없어 상태 확인이 필요합니다.";color="#9ca3af";}
        }
        var at=all.stream().map(SensorDataRaw::getMeasuredAt).filter(Objects::nonNull).max(Comparator.naturalOrder()).map(t->t.atOffset(ZoneOffset.UTC)).orElse(null);
        return ZonePublicResponse.builder().zoneId(zone.getId()).name(zone.getName()).address(zone.getAddress()).floor(zone.getFloor()).gender(zone.getGender()).zoneType(zone.getZoneType()==null?null:zone.getZoneType().name()).latitude(zone.getLatitude()).longitude(zone.getLongitude())
            .isOurSolution(zone.getIsOurSolution()).isActive(!Boolean.FALSE.equals(zone.getIsActive())).temp(value(temp)).humidity(value(hum)).gasLevel(value(gas)).mq7Level(value(mq7))
            .status(status).statusMessage(message).color(color).stale(stale).measuredAt(at)
            .pleasantThreshold(zone.getPleasantThreshold()).needsVentilationThreshold(zone.getNeedsVentilationThreshold()).build();
    }
    private boolean over(Optional<SensorDataRaw> row,double threshold){return row.isPresent() && row.get().getMeasuredValue().doubleValue()>=threshold;}
    private Float value(Optional<SensorDataRaw> row){return row.map(r->r.getMeasuredValue().floatValue()).orElse(null);}
    private Optional<SensorDataRaw> latest(Long id,MetricCode code){return sensorDataRawRepository.latestCurrentMetric(id,code,org.springframework.data.domain.PageRequest.of(0,1)).stream().findFirst();}
    private Optional<SensorDataRaw> latestModel(Long id,SensorModel model){return sensorDataRawRepository.latestCurrentModel(id,model,org.springframework.data.domain.PageRequest.of(0,1)).stream().findFirst();}
    @Transactional(readOnly=true) public ZoneStatusResponse getZoneStatus(Long id){
        Zone zone=zoneRepository.findById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Zone not found"));
        var row=response(zone,settings.all());return ZoneStatusResponse.builder().zoneId(id).name(publicName(zone.getName())).status(row.getStatus()).statusMessage(row.getStatusMessage()).build();
    }
    private String publicName(String name){return name==null?null:name.replaceAll("(?i)(?:[0-9a-f]{2}:){5}[0-9a-f]{2}","장치");}
}
