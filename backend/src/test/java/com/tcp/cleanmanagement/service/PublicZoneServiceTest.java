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

@ExtendWith(MockitoExtension.class)
class PublicZoneServiceTest {
    @Mock ZoneRepository zoneRepository;
    @Mock SensorDataRawRepository rawRepository;
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
        assertEquals("Clean", response.getStatus());
    }

    @Test
    void temperatureWithoutGasDoesNotFabricateGasOrHumidity() {
        when(zoneRepository.findAll()).thenReturn(List.of(Zone.builder()
                .id(1L).zoneType(ZoneType.TOILET).pleasantThreshold(50.0f).build()));
        when(rawRepository.findFirstByMetricSensorZoneIdAndMetricMetricCodeOrderByMeasuredAtDescIdDesc(1L, MetricCode.GAS))
                .thenReturn(Optional.empty());
        when(rawRepository.findFirstByMetricSensorZoneIdAndMetricMetricCodeOrderByMeasuredAtDescIdDesc(1L, MetricCode.HUMIDITY))
                .thenReturn(Optional.empty());
        stubReading(MetricCode.TEMPERATURE, "80");

        var response = service.getZones(null, null, null, null).get(0);

        assertEquals(80.0f, response.getTemp());
        assertNull(response.getGasLevel());
        assertNull(response.getHumidity());
        assertEquals("No Data", response.getStatus());
    }

    @Test
    void exposesMq7SensorReadingWhenPresent() {
        when(zoneRepository.findAll()).thenReturn(List.of(Zone.builder()
                .id(1L).zoneType(ZoneType.TOILET).pleasantThreshold(50.0f).build()));
        when(rawRepository.findFirstByMetricSensorZoneIdAndMetricSensorSensorModelOrderByMeasuredAtDescIdDesc(
                1L, com.tcp.cleanmanagement.enums.SensorModel.MQ7))
                .thenReturn(Optional.of(SensorDataRaw.builder().measuredValue(new BigDecimal("123.4")).build()));
        stubReading(MetricCode.GAS, "15.0");

        var response = service.getZones(null, null, null, null).get(0);
        assertEquals(15.0f, response.getGasLevel());
        assertEquals(123.4f, response.getMq7Level());
    }

    private void stubReading(MetricCode code, String value) {
        when(rawRepository.findFirstByMetricSensorZoneIdAndMetricMetricCodeOrderByMeasuredAtDescIdDesc(1L, code))
                .thenReturn(Optional.of(SensorDataRaw.builder().measuredValue(new BigDecimal(value)).build()));
    }
}
