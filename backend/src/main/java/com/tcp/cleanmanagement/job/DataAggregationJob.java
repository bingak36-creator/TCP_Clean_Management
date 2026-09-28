package com.tcp.cleanmanagement.job;

import com.tcp.cleanmanagement.entity.SensorDataAggregated;
import com.tcp.cleanmanagement.enums.AggregationGranularity;
import com.tcp.cleanmanagement.repository.AggregationResult;
import com.tcp.cleanmanagement.repository.SensorDataAggregatedRepository;
import com.tcp.cleanmanagement.repository.SensorDataRawRepository;
import com.tcp.cleanmanagement.repository.SensorMetricRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataAggregationJob {

    private final SensorDataRawRepository rawRepository;
    private final SensorDataAggregatedRepository aggregatedRepository;
    private final SensorMetricRepository metricRepository;

    @Scheduled(cron = "0 0 * * * *", zone = "UTC")
    @Transactional
    public void aggregateHourlyData() {
        LocalDateTime end = LocalDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.HOURS);
        aggregateBucket(AggregationGranularity.HOUR, end.minusHours(1), end);
    }

    @Scheduled(cron = "0 10 0 * * *", zone = "UTC")
    @Transactional
    public void aggregateDailyData() {
        LocalDateTime end = LocalDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.DAYS);
        aggregateBucket(AggregationGranularity.DAY, end.minusDays(1), end);
    }

    private void aggregateBucket(AggregationGranularity granularity, LocalDateTime start, LocalDateTime end) {
        List<AggregationResult> results = rawRepository.aggregateDataByTimeRange(start, end);

        for (AggregationResult result : results) {
            SensorDataAggregated aggregated = aggregatedRepository
                    .findByMetricIdAndGranularityAndBucketStart(result.getMetricId(), granularity, start)
                    .orElseGet(() -> SensorDataAggregated.builder()
                            .metric(metricRepository.getReferenceById(result.getMetricId()))
                            .granularity(granularity)
                            .bucketStart(start)
                            .build());
            aggregated.setSampleCount(result.getSampleCount());
            aggregated.setSumValue(result.getSumValue());
            aggregated.setAvgValue(result.getSumValue().divide(
                    java.math.BigDecimal.valueOf(result.getSampleCount()), 8, RoundingMode.HALF_UP));
            aggregated.setMinValue(result.getMinValue());
            aggregated.setMaxValue(result.getMaxValue());
            aggregated.setComputedAt(LocalDateTime.now(ZoneOffset.UTC));
            aggregatedRepository.save(aggregated);
        }

        log.info("{} aggregation completed for {}: {} metrics", granularity, start, results.size());
    }

    @Scheduled(cron = "0 0 2 * * *", zone = "UTC")
    @Transactional
    public void cleanupOldRawData() {
        LocalDateTime cutoff = LocalDateTime.now(ZoneOffset.UTC).minusDays(7);
        int deleted = rawRepository.deleteOlderThan(cutoff);
        log.info("Deleted {} raw readings older than {}", deleted, cutoff);
    }
}
