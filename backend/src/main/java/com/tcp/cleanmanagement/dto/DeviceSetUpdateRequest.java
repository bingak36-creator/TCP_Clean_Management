package com.tcp.cleanmanagement.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class DeviceSetUpdateRequest {
    @Positive
    private Long zoneId;

    @Pattern(regexp = "[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}")
    private String macAddress;

    @Size(max = 100)
    @Pattern(regexp = "(?s).*\\S.*", message = "Installation label must not be blank")
    private String installationLabel;
}
