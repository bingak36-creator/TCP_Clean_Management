package com.tcp.cleanmanagement.service;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.enums.*;
import com.tcp.cleanmanagement.event.SensorDataSavedEvent;
import com.tcp.cleanmanagement.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.event.*;
import java.time.*;
import java.math.BigDecimal;
import java.util.*;
@Service @RequiredArgsConstructor
public class AnalyticsService {
    private final SensorDataRawRepository dataRepository; private final AlertRepository alertRepository;
    private final SensorRepository sensors; private final OperationalSettingsService settings;
    @Async @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT) @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void handleSensorDataSaved(SensorDataSavedEvent event){
        var raw=dataRepository.findById(event.getDataId()).orElse(null); if(raw==null)return;
        var sensor=sensors.findByIdForUpdate(raw.getMetric().getSensor().getId()).orElse(null);if(sensor==null || sensor.getStatus()!=SensorStatus.ACTIVE)return;
        Zone zone=raw.getDeviceSetHistory()==null?sensor.getZone():raw.getDeviceSetHistory().getZone();
        if(zone==null || Boolean.FALSE.equals(zone.getIsActive()) || Boolean.FALSE.equals(sensor.getZone().getIsActive()))return;
        if(raw.getMeasuredAt().isBefore(LocalDateTime.now(ZoneOffset.UTC).minusSeconds(settings.offlineSeconds())))return;
        if(raw.getMetric().getMetricCode()==MetricCode.TEMPERATURE)
            incident(raw,sensor,zone,AlertType.FREEZE,raw.getMeasuredValue().signum()<0,"온도 영하 하락 (동파 위험): "+raw.getMeasuredValue()+"°C");
        if(raw.getMetric().getMetricCode()==MetricCode.GAS && sensor.getSensorModel()!=SensorModel.MQ7
            && !"UNVERIFIED".equals(raw.getMetric().getUnitCode()) && raw.getMetric().getPleasantThreshold()!=null
            && raw.getMetric().getNeedsVentilationThreshold()!=null){
            // Alarm above the ventilation threshold, recover only at or below the pleasant one (no flapping in between).
            BigDecimal value=raw.getMeasuredValue();
            if(value.compareTo(raw.getMetric().getNeedsVentilationThreshold())>0)
                incident(raw,sensor,zone,AlertType.SMOKING,true,"가스 센서 임계 초과 (흡연/역류 의심): "+value+" "+raw.getMetric().getUnitCode());
            else if(value.compareTo(raw.getMetric().getPleasantThreshold())<=0)
                incident(raw,sensor,zone,AlertType.SMOKING,false,null);
        }
    }
    private void incident(SensorDataRaw raw,Sensor sensor,Zone zone,AlertType type,boolean alarm,String message){
        Long history=raw.getDeviceSetHistory()==null?null:raw.getDeviceSetHistory().getId();
        var incidents=alertRepository.findBySensorIdAndAlertTypeAndDetectionSourceAndDeviceSetHistoryId(sensor.getId(),type,"RULE",history);
        var open=incidents.stream().filter(a->a.getStatus()==AlertStatus.UNRESOLVED).toList();
        if(!alarm){open.forEach(a->{a.setStatus(AlertStatus.RESOLVED);a.setResolvedAt(LocalDateTime.now(ZoneOffset.UTC));a.setResolutionSource("RECOVERY");});return;}
        if(!open.isEmpty())return;
        LocalDateTime cutoff=LocalDateTime.now(ZoneOffset.UTC).minusSeconds((long)settings.number("alert_cooldown_seconds"));
        if(incidents.stream().anyMatch(a->a.getCreatedAt()!=null && a.getCreatedAt().isAfter(cutoff)))return;
        alertRepository.save(Alert.builder().zone(zone).sensor(sensor).deviceSetHistory(raw.getDeviceSetHistory()).alertType(type)
            .message(message).status(AlertStatus.UNRESOLVED).detectionSource("RULE").build());
    }
}
