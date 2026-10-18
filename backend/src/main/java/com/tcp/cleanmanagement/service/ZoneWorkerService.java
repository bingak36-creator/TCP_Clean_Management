package com.tcp.cleanmanagement.service;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@Service @RequiredArgsConstructor
public class ZoneWorkerService {
    private final ZoneRepository zones;private final WorkerRepository workers;
    @Transactional public Zone assign(Long zoneId,Long workerId) {
        // One ordering serializes moves involving two workers or zones.
        var locked=workers.findAllForUpdate();
        var zone=zones.findByIdForUpdate(zoneId).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        Worker selected=workerId==null?null:locked.stream().filter(w->w.getId().equals(workerId)).findFirst()
            .orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        locked.stream().filter(w->zoneId.equals(w.getAssignedZoneId())).forEach(w->w.setAssignedZoneId(null));
        zone.setAssignedWorkerId(null);zone.setAssignedWorkerName(null);
        if(selected!=null) {
            for(var previous:zones.findByAssignedWorkerId(workerId)) {
                previous.setAssignedWorkerId(null);previous.setAssignedWorkerName(null);
            }
            selected.setAssignedZoneId(zoneId);zone.setAssignedWorkerId(workerId);zone.setAssignedWorkerName(selected.getName());
        }
        return zone;
    }
}
