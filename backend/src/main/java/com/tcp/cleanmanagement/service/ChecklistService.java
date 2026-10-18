package com.tcp.cleanmanagement.service;
import com.tcp.cleanmanagement.dto.ChecklistToggleRequest;
import com.tcp.cleanmanagement.entity.DailyChecklist;
import com.tcp.cleanmanagement.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.util.*;
@Service @RequiredArgsConstructor
public class ChecklistService {
    private final DailyChecklistRepository items; private final ZoneRepository zones;
    private static final Set<String> KEYS=Set.of("toilet","sink","floor","trash","ventilation","soap","vent");
    public LocalDate date(String value){
        if(value==null || value.isBlank()) return LocalDate.now(ZoneId.of("Asia/Seoul"));
        try { if(!value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw new IllegalArgumentException();LocalDate parsed=LocalDate.parse(value);if(parsed.getYear()<1970)throw new IllegalArgumentException();return parsed; }
        catch(RuntimeException error){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid checklist date");}
    }
    @Transactional(readOnly=true) public List<DailyChecklist> list(Long zone,String date){return items.findByZoneIdAndCheckDate(zone,date(date));}
    @Transactional public DailyChecklist set(ChecklistToggleRequest request,Long actor){
        if(request.getZoneId()==null || request.getZoneId()<=0 || !KEYS.contains(request.getItemKey()==null?"":request.getItemKey()) || request.getIsCompleted()==null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Zone, known checklist item and explicit completion state are required");
        LocalDate day=date(request.getDate());
        // Serialize inserts and updates per zone, including concurrent first-time inserts.
        zones.findByIdForUpdate(request.getZoneId()).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Zone not found"));
        var item=items.findByZoneIdAndCheckDateAndItemKey(request.getZoneId(),day,request.getItemKey())
            .orElseGet(()->DailyChecklist.builder().zoneId(request.getZoneId()).checkDate(day).itemKey(request.getItemKey()).build());
        item.setCompleted(request.getIsCompleted()); item.setCompletedBy(actor);
        item.setCompletedAt(request.getIsCompleted()?LocalDateTime.now(ZoneOffset.UTC):null);
        return items.saveAndFlush(item);
    }
    @Transactional public List<DailyChecklist> batch(Long zone,String day,Map<String,Boolean> values,Long actor) {
        if(values==null || values.isEmpty() || values.size()>KEYS.size()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        for(var entry:values.entrySet()) {
            var request=new ChecklistToggleRequest();request.setZoneId(zone);request.setDate(day);
            request.setItemKey(entry.getKey());request.setIsCompleted(entry.getValue());set(request,actor);
        }
        return list(zone,day);
    }
}
