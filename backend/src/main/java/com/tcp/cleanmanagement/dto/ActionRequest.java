package com.tcp.cleanmanagement.dto;
import lombok.Data;
@Data
public class ActionRequest {
    private String actionDetail;
    private Long adminId; // In real app, extracted from JWT token
}
