package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.SensorCreateRequest;
import com.tcp.cleanmanagement.dto.ZoneCreateRequest;
import com.tcp.cleanmanagement.entity.Sensor;
import com.tcp.cleanmanagement.entity.SensorMetric;
import com.tcp.cleanmanagement.entity.Zone;
import com.tcp.cleanmanagement.enums.MetricCode;
import com.tcp.cleanmanagement.enums.SensorModel;
import com.tcp.cleanmanagement.enums.SensorStatus;
import com.tcp.cleanmanagement.enums.SensorType;
import com.tcp.cleanmanagement.repository.SensorMetricRepository;
import com.tcp.cleanmanagement.repository.SensorRepository;
import com.tcp.cleanmanagement.repository.ZoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;

@Service
@RequiredArgsConstructor
public class DevZoneService {
    private final ZoneRepository zoneRepository;
    private final SensorRepository sensorRepository;
    private final SensorMetricRepository metricRepository;
    private final ZoneWorkerService assignments;

    @Transactional
    public Long createZone(ZoneCreateRequest request) {
        if(request==null || request.getName()==null || request.getName().isBlank() || request.getName().length()>255 || request.getZoneType()==null) throw bad();
        validate(request.getLatitude(),request.getLongitude(),request.getPleasantThreshold(),request.getNeedsVentilationThreshold());
        Zone zone = Zone.builder()
                .name(request.getName())
                .address(request.getAddress()).floor(request.getFloor()).gender(request.getGender())
                .latitude(request.getLatitude())
                .longitude(request.getLongitude())
                .zoneType(request.getZoneType())
                .isOurSolution(request.getIsOurSolution())
                .pleasantThreshold(request.getPleasantThreshold())
                .needsVentilationThreshold(request.getNeedsVentilationThreshold())
                .build();
        
        var saved=zoneRepository.saveAndFlush(zone);
        if(request.getAssignedWorkerId()!=null) assignments.assign(saved.getId(),request.getAssignedWorkerId());
        return saved.getId();
    }

    @Transactional
    public Long createSensor(SensorCreateRequest request) {
        if(request==null || request.getZoneId()==null || request.getZoneId()<=0 || request.getSensorType()==null) throw bad();
        Zone zone = zoneRepository.findById(request.getZoneId())
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,"Zone not found"));

        Sensor sensor = Sensor.builder()
                .zone(zone)
                .sensorType(request.getSensorType())
                .sensorModel(request.getSensorModel())
                .status(request.getStatus()==null?SensorStatus.ACTIVE:request.getStatus())
                .build();

        if(request.getSensorModel()!=null && request.getSensorModel().sensorType()!=request.getSensorType()) throw bad();
        return sensorRepository.save(sensor).getId();
    }

    public record GasCalibration(@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max=24) String unitCode,
            @jakarta.validation.constraints.NotNull @jakarta.validation.constraints.DecimalMin("0") @jakarta.validation.constraints.Digits(integer=12, fraction=6) BigDecimal pleasantThreshold,
            @jakarta.validation.constraints.NotNull @jakarta.validation.constraints.DecimalMin("0") @jakarta.validation.constraints.Digits(integer=12, fraction=6) BigDecimal needsVentilationThreshold) {}

    /** Gas rule alerts stay off until the hardware unit is verified and both thresholds are set. */
    @Transactional
    public GasCalibration calibrateGas(Long sensorId, GasCalibration request) {
        Sensor sensor = sensorRepository.findById(sensorId)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,"Sensor not found"));
        if (sensor.getSensorType() != SensorType.GAS || sensor.getSensorModel() == SensorModel.MQ7
                || "UNVERIFIED".equalsIgnoreCase(request.unitCode().trim())
                || request.pleasantThreshold().compareTo(request.needsVentilationThreshold()) >= 0) throw bad();
        SensorMetric metric = metricRepository.findBySensorIdAndMetricCode(sensorId, MetricCode.GAS)
                .orElseGet(() -> SensorMetric.builder().sensor(sensor).metricCode(MetricCode.GAS).build());
        metric.setUnitCode(request.unitCode().trim());
        metric.setPleasantThreshold(request.pleasantThreshold());
        metric.setNeedsVentilationThreshold(request.needsVentilationThreshold());
        metricRepository.save(metric);
        return new GasCalibration(metric.getUnitCode(), metric.getPleasantThreshold(), metric.getNeedsVentilationThreshold());
    }

    @Transactional
    public void deleteZone(Long id) {
        Zone zone = zoneRepository.findById(id)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,"Zone not found"));
        try {
            zoneRepository.delete(zone);
            zoneRepository.flush();
        } catch (org.springframework.dao.DataIntegrityViolationException error) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,
                    "Zone still has sensors, devices, permissions or records; deactivate it instead", error);
        }
    }

    @Transactional
    public Boolean toggleZoneActive(Long id) {
        Zone zone = zoneRepository.findById(id)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,"Zone not found"));
        boolean current = zone.getIsActive() != null ? zone.getIsActive() : true;
        zone.setIsActive(!current);
        return zoneRepository.save(zone).getIsActive();
    }

    @Transactional
    public Zone updateZone(Long id, ZoneCreateRequest request) {
        Zone zone = zoneRepository.findById(id)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,"Zone not found"));
        validate(request.getLatitude()==null?zone.getLatitude():request.getLatitude(), request.getLongitude()==null?zone.getLongitude():request.getLongitude(),
                request.getPleasantThreshold()==null?zone.getPleasantThreshold():request.getPleasantThreshold(),
                request.getNeedsVentilationThreshold()==null?zone.getNeedsVentilationThreshold():request.getNeedsVentilationThreshold());
        if(request.getName()!=null && (request.getName().isBlank() || request.getName().length()>255)) throw bad();
        if(request.getLatitude()!=null) zone.setLatitude(request.getLatitude());
        if(request.getLongitude()!=null) zone.setLongitude(request.getLongitude());
        if(request.getZoneType()!=null) zone.setZoneType(request.getZoneType());
        if(request.getIsOurSolution()!=null)zone.setIsOurSolution(request.getIsOurSolution());
        if(request.getAssignedWorkerId()!=null)assignments.assign(id,request.getAssignedWorkerId());
        if (request.getName() != null) zone.setName(request.getName());
        if (request.getAddress() != null) zone.setAddress(request.getAddress());
        if(request.getFloor()!=null)zone.setFloor(request.getFloor());
        if(request.getGender()!=null)zone.setGender(request.getGender());
        if (request.getPleasantThreshold() != null) zone.setPleasantThreshold(request.getPleasantThreshold());
        if (request.getNeedsVentilationThreshold() != null) zone.setNeedsVentilationThreshold(request.getNeedsVentilationThreshold());
        return zoneRepository.save(zone);
    }
    private void validate(Double lat,Double lon,Float low,Float high) {
        if((lat==null)!=(lon==null) || lat!=null && (!Double.isFinite(lat)||!Double.isFinite(lon)||lat < -90||lat>90||lon < -180||lon>180)) throw bad();
        if(low!=null && (!Float.isFinite(low)||low<0||low>4095) || high!=null && (!Float.isFinite(high)||high<0||high>4095) || low!=null && high!=null && low>=high) throw bad();
    }
    private org.springframework.web.server.ResponseStatusException bad(){return new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"Invalid zone or sensor configuration");}
}
