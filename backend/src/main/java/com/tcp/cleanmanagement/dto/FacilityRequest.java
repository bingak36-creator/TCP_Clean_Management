package com.tcp.cleanmanagement.dto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
public record FacilityRequest(@Valid @NotNull ZoneCreateRequest zone,@Valid Device device) {
    public record Device(@Positive Long deviceSetId,
        @NotBlank @Pattern(regexp="[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}") String macAddress) {}
}
