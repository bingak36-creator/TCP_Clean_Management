package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.entity.SensorDataRaw;
import com.tcp.cleanmanagement.entity.Zone;
import com.tcp.cleanmanagement.enums.MetricCode;
import com.tcp.cleanmanagement.enums.ZoneType;
import com.tcp.cleanmanagement.repository.SensorDataRawRepository;
import com.tcp.cleanmanagement.repository.ZoneRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.*;

@ExtendWith(MockitoExtension.class)
class PublicZoneServiceTest {
    @Mock ZoneRepository zoneRepository;
    @Mock SensorDataRawRepository rawRepository;
    @org.mockito.Spy OperationalSettingsService settings = new OperationalSettingsService(org.mockito.Mockito.mock(com.tcp.cleanmanagement.repository.SystemSettingRepository.class));
    @InjectMocks PublicZoneService service;

    @Test
    void exposesEachMetricSeparatelyAndClassifiesUsingGas() {
        when(zoneRepository.findAll()).thenReturn(List.of(Zone.builder()
                .id(1L).zoneType(ZoneType.TOILET).pleasantThreshold(50.0f).build()));
        stubReading(MetricCode.GAS, "10");
        stubReading(MetricCode.TEMPERATURE, "22.5");
        stubReading(MetricCode.HUMIDITY, "61.2");

        var response = service.getZones(null, null, null, null).get(0);

        assertEquals(10.0f, response.getGasLevel());
        assertEquals(22.5f, response.getTemp());
        assertEquals(61.2f, response.getHumidity());
        assertEquals("NORMAL", response.getStatus());
    }

    @Test
    void temperatureWithoutGasDoesNotFabricateGasOrHumidity() {
        when(zoneRepository.findAll()).thenReturn(List.of(Zone.builder()
                .id(1L).zoneType(ZoneType.TOILET).pleasantThreshold(50.0f).build()));
        when(rawRepository.latestCurrentMetric(eq(1L),eq(MetricCode.GAS),any()))
                .thenReturn(List.of());
        when(rawRepository.latestCurrentMetric(eq(1L),eq(MetricCode.HUMIDITY),any()))
                .thenReturn(List.of());
        stubReading(MetricCode.TEMPERATURE, "80");

        var response = service.getZones(null, null, null, null).get(0);

        assertEquals(80.0f, response.getTemp());
        assertNull(response.getGasLevel());
        assertNull(response.getHumidity());
        assertEquals("DANGER", response.getStatus());
    }

    @Test
    void exposesMq7SensorReadingWhenPresent() {
        when(zoneRepository.findAll()).thenReturn(List.of(Zone.builder()
                .id(1L).zoneType(ZoneType.TOILET).pleasantThreshold(50.0f).build()));
        when(rawRepository.latestCurrentModel(eq(1L),eq(com.tcp.cleanmanagement.enums.SensorModel.MQ135),any())).thenReturn(List.of());
        when(rawRepository.latestCurrentModel(eq(1L),eq(com.tcp.cleanmanagement.enums.SensorModel.MQ7),any()))
                .thenReturn(List.of(SensorDataRaw.builder().measuredValue(new BigDecimal("123.4")).measuredAt(java.time.LocalDateTime.now(java.time.ZoneOffset.UTC)).build()));
        stubReading(MetricCode.GAS, "15.0");

        var response = service.getZones(null, null, null, null).get(0);
        assertEquals(15.0f, response.getGasLevel());
        assertEquals(123.4f, response.getMq7Level());
    }

    private void stubReading(MetricCode code, String value) {
        when(rawRepository.latestCurrentMetric(eq(1L),eq(code),any()))
                .thenReturn(List.of(SensorDataRaw.builder().measuredValue(new BigDecimal(value)).measuredAt(java.time.LocalDateTime.now(java.time.ZoneOffset.UTC)).build()));
    }
}
