package com.tcp.cleanmanagement.job;

import com.tcp.cleanmanagement.entity.SensorDataAggregated;
import com.tcp.cleanmanagement.enums.AggregationGranularity;
import com.tcp.cleanmanagement.repository.AggregationResult;
import com.tcp.cleanmanagement.repository.SensorDataAggregatedRepository;
import com.tcp.cleanmanagement.repository.SensorDataRawRepository;
import com.tcp.cleanmanagement.repository.SensorMetricRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DataAggregationJobTest {
    @Mock SensorDataRawRepository rawRepository;
    @Mock SensorDataAggregatedRepository aggregateRepository;
    @Mock SensorMetricRepository metricRepository;
    @InjectMocks DataAggregationJob job;

    @Test
    void rerunUpdatesTheSameHourlyBucketWithWeightedAverage() {
        AggregationResult result = mock(AggregationResult.class);
        when(result.getMetricId()).thenReturn(42L);
        when(result.getSampleCount()).thenReturn(3L);
        when(result.getSumValue()).thenReturn(new BigDecimal("7.000000"));
        when(result.getMinValue()).thenReturn(new BigDecimal("1.000000"));
        when(result.getMaxValue()).thenReturn(new BigDecimal("4.000000"));
        when(rawRepository.aggregateDataByTimeRange(any(), any())).thenReturn(List.of(result));
        SensorDataAggregated existing = SensorDataAggregated.builder()
                .id(9L).granularity(AggregationGranularity.HOUR).build();
        when(aggregateRepository.findByMetricIdAndGranularityAndBucketStart(
                eq(42L), eq(AggregationGranularity.HOUR), any(LocalDateTime.class)))
                .thenReturn(Optional.of(existing));

        job.aggregateHourlyData();

        assertEquals(9L, existing.getId());
        assertEquals(3L, existing.getSampleCount());
        assertEquals(new BigDecimal("2.33333333"), existing.getAvgValue());
        assertEquals(new BigDecimal("1.000000"), existing.getMinValue());
        verify(aggregateRepository).save(existing);
        verifyNoInteractions(metricRepository);
    }
}
