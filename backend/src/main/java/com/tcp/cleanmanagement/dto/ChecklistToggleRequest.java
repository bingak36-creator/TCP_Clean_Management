package com.tcp.cleanmanagement.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ChecklistToggleRequest {
    private Long zoneId;
    private String date; // YYYY-MM-DD
    private String itemKey;
    private Boolean isCompleted;
    private Long completedBy;
}
