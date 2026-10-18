package com.tcp.cleanmanagement.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class WorkerRequest {
    private String name;
    private String phone;
    private Long assignedZoneId;
    private String status;
    private String role;
}
