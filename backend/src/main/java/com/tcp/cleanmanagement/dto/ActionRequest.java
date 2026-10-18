package com.tcp.cleanmanagement.dto;
import lombok.Data;
@Data
public class ActionRequest {
    @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max=4000)
    private String actionDetail;
    private Long adminId; // In real app, extracted from JWT token
}
