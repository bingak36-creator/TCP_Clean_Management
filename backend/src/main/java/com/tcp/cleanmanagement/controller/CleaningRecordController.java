package com.tcp.cleanmanagement.controller;
import com.tcp.cleanmanagement.dto.CleaningRecordRequest;
import com.tcp.cleanmanagement.entity.CleaningRecord;
import com.tcp.cleanmanagement.repository.CleaningRecordRepository;
import com.tcp.cleanmanagement.security.AccessService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.List;
@RestController @RequestMapping("/api/admin/cleaning-records") @RequiredArgsConstructor
public class CleaningRecordController {
    private final com.tcp.cleanmanagement.repository.ZoneRepository zones;
    private final CleaningRecordRepository records; private final AccessService access;
    @GetMapping public List<CleaningRecord> list(@RequestParam(required=false) Long zoneId){
        if(zoneId!=null) access.requireZone(zoneId);
        return (zoneId==null?records.findAllByOrderByCreatedAtDesc():records.findByZoneIdOrderByCreatedAtDesc(zoneId)).stream().filter(r->access.canZone(r.getZoneId())).toList();
    }
    @PostMapping public ResponseEntity<CleaningRecord> create(@Valid @RequestBody CleaningRecordRequest request){
        access.requireZone(request.zoneId());
        var zone=zones.findById(request.zoneId()).orElseThrow(()->new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND,"Zone not found"));
        var user=access.current();
        var row=CleaningRecord.builder().zoneId(request.zoneId()).restroomName(zone.getName()).worker(user.role()==com.tcp.cleanmanagement.enums.Role.CLEANER?user.username():request.worker())
            .type(request.type()).memo(request.memo()).createdBy(user.id()).build();
        return ResponseEntity.status(HttpStatus.CREATED).body(records.save(row));
    }
}
