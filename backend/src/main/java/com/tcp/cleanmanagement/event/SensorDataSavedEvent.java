package com.tcp.cleanmanagement.event;
import com.tcp.cleanmanagement.entity.SensorDataRaw;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class SensorDataSavedEvent {
    private SensorDataRaw data;
}
