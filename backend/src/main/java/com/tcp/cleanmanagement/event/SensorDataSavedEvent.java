package com.tcp.cleanmanagement.event;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class SensorDataSavedEvent {
    private Long dataId;
}
