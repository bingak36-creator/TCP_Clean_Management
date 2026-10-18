package com.tcp.cleanmanagement.service;
import com.tcp.cleanmanagement.dto.SensorCreateRequest;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
@Service @RequiredArgsConstructor
public class SensorManagementService {
    private final SensorRepository sensors;private final SensorMetricRepository metrics;private final ZoneRepository zones;
    @Transactional(readOnly=true) public List<Map<String,Object>> list(Long zone) {
        return sensors.findAll().stream().filter(s->zone==null||s.getZone()!=null&&zone.equals(s.getZone().getId())).map(this::view).toList();
    }
    @Transactional public Map<String,Object> update(Long id,SensorCreateRequest request) {
        var sensor=sensors.findByIdForUpdate(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        boolean reconfigure=request.getZoneId()!=null&&!request.getZoneId().equals(sensor.getZone().getId())
            ||request.getSensorType()!=null&&request.getSensorType()!=sensor.getSensorType()
            ||request.getSensorModel()!=null&&request.getSensorModel()!=sensor.getSensorModel();
        if(reconfigure && (sensor.getDeviceSet()!=null || !metrics.findBySensorId(id).isEmpty()))
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Configured sensors must retain their measurement identity; register a replacement");
        if(request.getZoneId()!=null)sensor.setZone(zones.findById(request.getZoneId()).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND)));
        if(request.getSensorType()!=null)sensor.setSensorType(request.getSensorType());
        if(request.getSensorModel()!=null)sensor.setSensorModel(request.getSensorModel());
        if(sensor.getSensorModel()!=null&&sensor.getSensorModel().sensorType()!=sensor.getSensorType())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Sensor model/type mismatch");
        if(request.getStatus()!=null)sensor.setStatus(request.getStatus());
        if(request.getPleasantThreshold()!=null||request.getNeedsVentilationThreshold()!=null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Use the validated gas-calibration endpoint with verified units");
        return view(sensor);
    }
    @Transactional public void delete(Long id) {
        var sensor=sensors.findByIdForUpdate(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        if(sensor.getDeviceSet()!=null)throw new ResponseStatusException(HttpStatus.CONFLICT,"Detach the sensor through its device set first");
        try {sensors.delete(sensor);sensors.flush();}
        catch(org.springframework.dao.DataIntegrityViolationException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Sensor is referenced by measurements or devices; deactivate it instead",error);
        }
    }
    private Map<String,Object> view(Sensor s) {
        var row=new LinkedHashMap<String,Object>();
        row.put("id",s.getId());row.put("sensorId",s.getId());row.put("zoneId",s.getZone()==null?null:s.getZone().getId());
        row.put("zoneName",s.getZone()==null?null:s.getZone().getName());row.put("deviceSetId",s.getDeviceSet()==null?null:s.getDeviceSet().getId());
        row.put("macAddress",s.getDeviceSet()==null?null:s.getDeviceSet().getMacAddress());
        row.put("sensorType",s.getSensorType());row.put("sensorModel",s.getSensorModel());row.put("status",s.getStatus());row.put("createdAt",s.getCreatedAt());
        return row;
    }
}
