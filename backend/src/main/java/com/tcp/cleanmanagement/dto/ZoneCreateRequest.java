package com.tcp.cleanmanagement.dto;
import com.tcp.cleanmanagement.enums.ZoneType;
import lombok.Data;

@Data
public class ZoneCreateRequest {
    @jakarta.validation.constraints.Size(max=255)
    private String name;
    @jakarta.validation.constraints.Size(max=255)
    private String address;
    @jakarta.validation.constraints.Pattern(regexp="B?[1-9][0-9]{0,2}F|RF|옥상")
    private String floor;
    @jakarta.validation.constraints.Pattern(regexp="남|여|공용")
    private String gender;
    private Double latitude;
    private Double longitude;
    private ZoneType zoneType;
    private Boolean isOurSolution;
    private Float pleasantThreshold;
    private Float needsVentilationThreshold;
    private Long assignedWorkerId;
    private String assignedWorkerName;
}
