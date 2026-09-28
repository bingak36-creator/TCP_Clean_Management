package com.tcp.cleanmanagement.repository;

import com.tcp.cleanmanagement.entity.Sensor;
import com.tcp.cleanmanagement.entity.SensorDataRaw;
import com.tcp.cleanmanagement.entity.SensorMetric;
import com.tcp.cleanmanagement.enums.MetricCode;
import com.tcp.cleanmanagement.enums.SensorType;
import com.tcp.cleanmanagement.enums.TimeSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
@Transactional
class SensorDataRawRepositoryTest {
    @Autowired SensorRepository sensorRepository;
    @Autowired SensorMetricRepository metricRepository;
    @Autowired SensorDataRawRepository rawRepository;

    @Test
    void aggregatesEachMetricWithoutMixingReadings() {
        Sensor sensor = sensorRepository.save(Sensor.builder().sensorType(SensorType.TEMP_HUMID).build());
        SensorMetric temperature = metricRepository.save(SensorMetric.builder().sensor(sensor)
                .metricCode(MetricCode.TEMPERATURE).unitCode("CELSIUS").build());
        SensorMetric humidity = metricRepository.save(SensorMetric.builder().sensor(sensor)
                .metricCode(MetricCode.HUMIDITY).unitCode("PERCENT").build());
        LocalDateTime start = LocalDateTime.of(2026, 9, 28, 0, 0);
        save(temperature, "one", "10", start.plusMinutes(1));
        save(temperature, "two", "20", start.plusMinutes(2));
        save(humidity, "one", "60", start.plusMinutes(1));
        rawRepository.flush();

        List<AggregationResult> results = rawRepository.aggregateDataByTimeRange(start, start.plusHours(1));

        AggregationResult tempResult = results.stream()
                .filter(result -> result.getMetricId().equals(temperature.getId())).findFirst().orElseThrow();
        AggregationResult humidityResult = results.stream()
                .filter(result -> result.getMetricId().equals(humidity.getId())).findFirst().orElseThrow();
        assertEquals(2L, tempResult.getSampleCount());
        assertEquals(0, tempResult.getSumValue().compareTo(new BigDecimal("30")));
        assertEquals(0, tempResult.getMinValue().compareTo(new BigDecimal("10")));
        assertEquals(0, tempResult.getMaxValue().compareTo(new BigDecimal("20")));
        assertEquals(1L, humidityResult.getSampleCount());
        assertEquals(0, humidityResult.getSumValue().compareTo(new BigDecimal("60")));
    }

    private void save(SensorMetric metric, String key, String value, LocalDateTime measuredAt) {
        rawRepository.save(SensorDataRaw.builder()
                .metric(metric).sampleKey(key).measuredValue(new BigDecimal(value))
                .measuredAt(measuredAt).receivedAt(measuredAt).timeSource(TimeSource.SERVER).build());
    }
}
