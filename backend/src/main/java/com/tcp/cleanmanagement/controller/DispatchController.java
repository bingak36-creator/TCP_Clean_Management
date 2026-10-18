package com.tcp.cleanmanagement.controller;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.repository.*;
import com.tcp.cleanmanagement.security.AccessService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
@RestController @RequiredArgsConstructor
public class DispatchController {
    private final AccessService access; private final WorkerRepository workers; private final ZoneRepository zones; private final CleaningRecordRepository records;
    public record Request(@NotEmpty @Size(max=50) Set<@NotNull @Positive Long> workerIds,@NotEmpty @Size(max=50) Set<@NotNull @Positive Long> zoneIds,
        @NotBlank @Size(max=80) String type,@NotBlank @Pattern(regexp="EMERGENCY|NORMAL|ROUTINE") String urgency,@Size(max=3500) String memo){}
    public record Result(List<CleaningRecord> records,List<Worker> workers){}
    @PostMapping("/api/admin/dispatches") @ResponseStatus(HttpStatus.CREATED) @Transactional
    public Result create(@Valid @RequestBody Request request){
        access.requireManager();request.zoneIds().forEach(access::requireZone);
        var assigned=new ArrayList<Worker>();
        for(Long id:request.workerIds().stream().sorted().toList()){
            var worker=workers.findByIdForUpdate(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Worker not found"));
            if(!access.isDeveloper()) access.requireZone(worker.getAssignedZoneId());
            if(!"AVAILABLE".equals(worker.getStatus()))throw new ResponseStatusException(HttpStatus.CONFLICT,"Worker is not available");assigned.add(worker);
        }
        var targets=zones.findAllById(request.zoneIds());
        if(targets.size()!=request.zoneIds().size())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Zone not found");
        if(targets.stream().anyMatch(z->Boolean.FALSE.equals(z.getIsActive())))throw new ResponseStatusException(HttpStatus.CONFLICT,"Zone inactive");
        assigned.forEach(w->w.setStatus("DISPATCHED"));
        var names=String.join(", ",assigned.stream().map(Worker::getName).toList());
        var saved=targets.stream().map(z->records.save(CleaningRecord.builder().zoneId(z.getId()).restroomName(z.getName()).worker(names)
            .type("출동 발령: "+request.type()).memo("["+request.urgency()+"] "+Objects.toString(request.memo(),"")).createdBy(access.current().id()).build())).toList();
        return new Result(saved,assigned);
    }
}
