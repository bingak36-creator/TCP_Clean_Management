package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.SensorDataRequest;
import com.tcp.cleanmanagement.entity.Sensor;
import com.tcp.cleanmanagement.entity.SensorDataRaw;
import com.tcp.cleanmanagement.entity.SensorMetric;
import com.tcp.cleanmanagement.enums.MetricCode;
import com.tcp.cleanmanagement.enums.SensorType;
import com.tcp.cleanmanagement.enums.TimeSource;
import com.tcp.cleanmanagement.event.SensorDataSavedEvent;
import com.tcp.cleanmanagement.repository.SensorDataRawRepository;
import com.tcp.cleanmanagement.repository.SensorMetricRepository;
import com.tcp.cleanmanagement.repository.SensorRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class IotDataServiceTest {
    @Mock SensorRepository sensorRepository;
    @Mock SensorMetricRepository metricRepository;
    @Mock SensorDataRawRepository dataRepository;
    @Mock ApplicationEventPublisher eventPublisher;
    @InjectMocks IotDataService service;

    @Test
    void splitsTemperatureAndHumidityAndConvertsDeviceTimeToUtc() {
        Sensor sensor = Sensor.builder().id(5L).sensorType(SensorType.TEMP_HUMID).build();
        when(sensorRepository.findByIdForUpdate(5L)).thenReturn(Optional.of(sensor));
        when(metricRepository.findBySensorIdAndMetricCode(eq(5L), any())).thenReturn(Optional.empty());
        AtomicLong ids = new AtomicLong();
        when(metricRepository.save(any())).thenAnswer(call -> {
            SensorMetric metric = call.getArgument(0);
            metric.setId(ids.incrementAndGet());
            return metric;
        });
        when(dataRepository.save(any())).thenAnswer(call -> {
            SensorDataRaw raw = call.getArgument(0);
            raw.setId(ids.incrementAndGet());
            return raw;
        });

        SensorDataRequest request = request("packet-1", OffsetDateTime.parse("2026-09-28T09:30:00+09:00"),
                reading(MetricCode.TEMPERATURE, "22.5"), reading(MetricCode.HUMIDITY, "61.2"));
        service.saveSensorData(5L, request);

        ArgumentCaptor<SensorDataRaw> captures = ArgumentCaptor.forClass(SensorDataRaw.class);
        verify(dataRepository, times(2)).save(captures.capture());
        List<SensorDataRaw> saved = captures.getAllValues();
        assertEquals(MetricCode.TEMPERATURE, saved.get(0).getMetric().getMetricCode());
        assertEquals("CELSIUS", saved.get(0).getMetric().getUnitCode());
        assertEquals(MetricCode.HUMIDITY, saved.get(1).getMetric().getMetricCode());
        assertEquals("PERCENT", saved.get(1).getMetric().getUnitCode());
        assertEquals(LocalDateTime.parse("2026-09-28T00:30:00"), saved.get(0).getMeasuredAt());
        assertEquals(TimeSource.DEVICE, saved.get(0).getTimeSource());
        assertEquals("packet-1", saved.get(1).getSampleKey());
        verify(eventPublisher, times(2)).publishEvent(any(SensorDataSavedEvent.class));
    }

    @Test
    void identicalResendDoesNotInsertOrAnalyzeAgain() {
        Sensor sensor = Sensor.builder().id(7L).sensorType(SensorType.GAS).build();
        SensorMetric metric = SensorMetric.builder().id(10L).sensor(sensor).metricCode(MetricCode.GAS)
                .unitCode("UNVERIFIED").build();
        when(sensorRepository.findByIdForUpdate(7L)).thenReturn(Optional.of(sensor));
        when(metricRepository.findBySensorIdAndMetricCode(7L, MetricCode.GAS)).thenReturn(Optional.of(metric));
        when(dataRepository.findByMetricIdAndSampleKey(10L, "packet-2"))
                .thenReturn(Optional.of(SensorDataRaw.builder().measuredValue(new BigDecimal("12.0")).build()));

        service.saveSensorData(7L, request("packet-2", null, reading(MetricCode.GAS, "12")));

        verify(dataRepository, never()).save(any());
        verifyNoInteractions(eventPublisher);
    }

    @Test
    void rejectsMetricThatDoesNotBelongToSensorType() {
        when(sensorRepository.findByIdForUpdate(7L))
                .thenReturn(Optional.of(Sensor.builder().id(7L).sensorType(SensorType.GAS).build()));

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.saveSensorData(7L, request("packet-3", null,
                        reading(MetricCode.TEMPERATURE, "25"))));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        verifyNoInteractions(metricRepository, dataRepository, eventPublisher);
    }

    private static SensorDataRequest request(String key, OffsetDateTime time, SensorDataRequest.Reading... readings) {
        SensorDataRequest request = new SensorDataRequest();
        request.setSampleKey(key);
        request.setMeasuredAt(time);
        request.setReadings(List.of(readings));
        return request;
    }

    private static SensorDataRequest.Reading reading(MetricCode code, String value) {
        SensorDataRequest.Reading reading = new SensorDataRequest.Reading();
        reading.setMetricCode(code);
        reading.setMeasuredValue(new BigDecimal(value));
        return reading;
    }
}
