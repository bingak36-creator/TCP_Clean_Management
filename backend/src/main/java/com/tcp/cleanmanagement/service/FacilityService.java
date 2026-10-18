package com.tcp.cleanmanagement.service;
import com.tcp.cleanmanagement.dto.*;
import com.tcp.cleanmanagement.entity.Zone;
import com.tcp.cleanmanagement.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@Service @RequiredArgsConstructor
public class FacilityService {
    private final DevZoneService zones;private final ZoneRepository repository;
    private final DeviceSetService sets;private final DeviceSetRepository installed;
    private final ZoneWorkerService assignments;
    @Transactional public Long create(FacilityRequest request) {
        if(request.device()!=null&&request.device().deviceSetId()!=null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"A new facility cannot reuse an installation ID");
        Long id=zones.createZone(request.zone());bind(id,request.device());return id;
    }
    @Transactional public Zone update(Long id,FacilityRequest request) {
        if(request.device()!=null&&request.device().deviceSetId()!=null) {
            var set=installed.findById(request.device().deviceSetId()).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
            if(!set.getZone().getId().equals(id))throw new ResponseStatusException(HttpStatus.CONFLICT,"Use device relocation to move an installation");
        }
        Zone zone=zones.updateZone(id,request.zone());
        assignments.assign(id,request.zone().getAssignedWorkerId());bind(id,request.device());return zone;
    }
    private void bind(Long zoneId,FacilityRequest.Device device) {
        if(device==null)return;
        String name=repository.findById(zoneId).orElseThrow().getName();
        String label=name.length()>100?name.substring(0,100):name;
        if(device.deviceSetId()!=null) {
            var update=new DeviceSetUpdateRequest();update.setZoneId(zoneId);update.setMacAddress(device.macAddress());update.setInstallationLabel(label);
            sets.update(device.deviceSetId(),update);
        } else {
            var request=new DeviceSetRequest();request.setSetCode("SET-"+zoneId);request.setZoneId(zoneId);
            request.setMacAddress(device.macAddress());request.setInstallationLabel(label);sets.register(request);
        }
    }
}
