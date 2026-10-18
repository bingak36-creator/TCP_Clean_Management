package com.tcp.cleanmanagement.controller;

import com.tcp.cleanmanagement.dto.WorkerRequest;
import com.tcp.cleanmanagement.entity.Worker;
import com.tcp.cleanmanagement.repository.WorkerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/workers")
@RequiredArgsConstructor
public class WorkerController {
    private final WorkerRepository workerRepository;
    private final com.tcp.cleanmanagement.service.ZoneWorkerService assignments;
    private final com.tcp.cleanmanagement.security.AccessService access;
    private final com.tcp.cleanmanagement.repository.ZoneRepository zones;

    @GetMapping
    public ResponseEntity<List<Worker>> list(@RequestParam(required = false) String status) {
        if (status != null && !status.isBlank()) {
            validateStatus(status);
            return ResponseEntity.ok(workerRepository.findByStatus(status).stream().filter(w->access.canZone(w.getAssignedZoneId()) || access.isDeveloper()).toList());
        }
        return ResponseEntity.ok(workerRepository.findAll().stream().filter(w->access.canZone(w.getAssignedZoneId()) || access.isDeveloper()).toList());
    }

    @PostMapping
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<Worker> create(@RequestBody WorkerRequest request) {
        access.requireDeveloper();
        if(request.getName()==null || request.getName().isBlank() || request.getName().length()>50 || request.getPhone()!=null && request.getPhone().length()>20
            || request.getRole()!=null && request.getRole().length()>30 || request.getAssignedZoneId()!=null && !zones.existsById(request.getAssignedZoneId())) throw bad();
        if(request.getStatus()!=null) validateStatus(request.getStatus());
        Worker worker = Worker.builder()
                .name(request.getName())
                .phone(request.getPhone() != null ? request.getPhone() : "")
                .assignedZoneId(request.getAssignedZoneId())
                .status(request.getStatus() != null ? request.getStatus() : "AVAILABLE")
                .role(request.getRole() != null ? request.getRole() : "CLEANER")
                .build();
        Worker saved = workerRepository.saveAndFlush(worker);
        if(request.getAssignedZoneId()!=null)assignments.assign(request.getAssignedZoneId(),saved.getId());
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<Worker> updateStatus(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        access.requireManager();
        return workerRepository.findById(id).map(worker -> {
            if(!access.isDeveloper()) access.requireZone(worker.getAssignedZoneId());
            String newStatus = body.get("status");
            validateStatus(newStatus); worker.setStatus(newStatus);
            return ResponseEntity.ok(workerRepository.save(worker));
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        access.requireDeveloper();
        if (workerRepository.existsById(id)) {
            for(var zone:zones.findByAssignedWorkerId(id)) assignments.assign(zone.getId(),null);
            workerRepository.deleteById(id);
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.notFound().build();
    }
    @PutMapping("/{id}") @org.springframework.transaction.annotation.Transactional
    public Worker update(@PathVariable Long id,@RequestBody WorkerRequest request) {
        access.requireDeveloper();
        if(request.getName()==null || request.getName().isBlank() || request.getName().length()>50 ||
            request.getPhone()!=null&&request.getPhone().length()>20 || request.getRole()!=null&&request.getRole().length()>30)throw bad();
        if(request.getStatus()!=null)validateStatus(request.getStatus());
        var worker=workerRepository.findById(id).orElseThrow(()->new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND));
        if(request.getAssignedZoneId()!=null)assignments.assign(request.getAssignedZoneId(),id);
        else for(var zone:zones.findByAssignedWorkerId(id))assignments.assign(zone.getId(),null);
        worker.setName(request.getName().trim());worker.setPhone(request.getPhone()==null?"":request.getPhone());
        if(request.getRole()!=null)worker.setRole(request.getRole());
        if(request.getStatus()!=null)worker.setStatus(request.getStatus());
        for(var zone:zones.findByAssignedWorkerId(id))zone.setAssignedWorkerName(worker.getName());
        return worker;
    }
    private void validateStatus(String value){if(value==null || !java.util.Set.of("AVAILABLE","DISPATCHED","OFF_DUTY").contains(value)) throw bad();}
    private org.springframework.web.server.ResponseStatusException bad(){return new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"Invalid worker data");}
}
