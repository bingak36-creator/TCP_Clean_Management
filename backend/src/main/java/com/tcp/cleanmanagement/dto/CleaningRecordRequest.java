package com.tcp.cleanmanagement.dto;
import jakarta.validation.constraints.*;
public record CleaningRecordRequest(@NotNull @Positive Long zoneId,@NotBlank @Size(max=255) String restroomName,
    @NotBlank @Size(max=255) String worker,@NotBlank @Size(max=100) String type,@Size(max=4000) String memo) {}
