package com.tcp.cleanmanagement.dto;

import com.tcp.cleanmanagement.enums.SensorModel;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.util.Map;

@Data
public class DeviceSetRequest {
    @NotBlank
    @Pattern(regexp = "[A-Za-z0-9_-]{1,64}")
    private String setCode;

    @NotBlank
    @Pattern(regexp = "[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}")
    private String macAddress;

    @NotNull @Positive
    private Long zoneId;

    @NotBlank @Size(max = 100)
    private String installationLabel;

    // Omit for a new set. Supply all three IDs to attach existing sensors without replacing data.
    private Map<SensorModel, @NotNull @Positive Long> existingSensorIds;
}
