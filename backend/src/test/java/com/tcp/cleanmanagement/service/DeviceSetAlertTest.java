package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.AlertResponse;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.enums.*;
import com.tcp.cleanmanagement.event.SensorDataSavedEvent;
import com.tcp.cleanmanagement.repository.ActionLogRepository;
import com.tcp.cleanmanagement.repository.AlertRepository;
import com.tcp.cleanmanagement.repository.SensorDataRawRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DeviceSetAlertTest {
    @Test
    void generatedAlertRetainsTheOriginSensorAndSetForDispatch() {
        Zone zone = Zone.builder().id(1L).name("Toilet A").build();
        DeviceSet set = DeviceSet.builder().id(2L).setCode("SET-002")
                .zone(zone).installationLabel("washbasin").build();
        Sensor sensor = Sensor.builder().id(6L).zone(zone).deviceSet(set)
                .sensorModel(SensorModel.DHT22).sensorType(SensorType.TEMP_HUMID).build();
        SensorMetric metric = SensorMetric.builder().sensor(sensor).metricCode(MetricCode.TEMPERATURE).build();
        SensorDataRaw data = SensorDataRaw.builder().id(42L).metric(metric)
                .measuredValue(new BigDecimal("-1")).build();
        SensorDataRawRepository dataRepository = mock(SensorDataRawRepository.class);
        AlertRepository alerts = mock(AlertRepository.class);
        when(dataRepository.findById(42L)).thenReturn(Optional.of(data));

        new AnalyticsService(dataRepository, alerts).handleSensorDataSaved(new SensorDataSavedEvent(42L));
        ArgumentCaptor<Alert> capture = ArgumentCaptor.forClass(Alert.class);
        verify(alerts).save(capture.capture());
        Alert created = capture.getValue();
        assertSame(sensor, created.getSensor());
        assertSame(zone, created.getZone());
        assertEquals(AlertType.FREEZE, created.getAlertType());

        Alert legacy = Alert.builder().id(7L).zone(zone).alertType(AlertType.FREEZE).build();
        when(alerts.findByStatus(AlertStatus.UNRESOLVED)).thenReturn(List.of(created, legacy));
        List<AlertResponse> response = new AdminAlertService(alerts, mock(ActionLogRepository.class))
                .getUnresolvedAlerts();
        assertEquals(2L, response.get(0).getDeviceSetId());
        assertEquals("SET-002", response.get(0).getSetCode());
        assertEquals("washbasin", response.get(0).getInstallationLabel());
        assertEquals(6L, response.get(0).getSensorId());
        assertEquals(SensorModel.DHT22, response.get(0).getSensorModel());
        assertNull(response.get(1).getDeviceSetId());
        assertEquals(1L, response.get(1).getZoneId());
    }
}
