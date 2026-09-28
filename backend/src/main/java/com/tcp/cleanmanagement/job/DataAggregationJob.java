package com.tcp.cleanmanagement.job;

import com.tcp.cleanmanagement.entity.Sensor;
import com.tcp.cleanmanagement.entity.SensorDataAggregated;
import com.tcp.cleanmanagement.repository.AggregationResult;
import com.tcp.cleanmanagement.repository.SensorDataAggregatedRepository;
import com.tcp.cleanmanagement.repository.SensorDataRawRepository;
import com.tcp.cleanmanagement.repository.SensorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataAggregationJob {

    private final SensorDataRawRepository rawRepository;
    private final SensorDataAggregatedRepository aggregatedRepository;
    private final SensorRepository sensorRepository;

    /**
     * Executes at the top of every hour (e.g., 10:00, 11:00)
     * Aggregates data from the previous hour (e.g., 09:00:00 to 09:59:59)
     */
    @Scheduled(cron = "0 0 * * * *")
    @Transactional
    public void aggregateHourlyData() {
        LocalDateTime now = LocalDateTime.now().truncatedTo(ChronoUnit.HOURS);
        LocalDateTime endTime = now;
        LocalDateTime startTime = now.minusHours(1);

        log.info("Starting hourly data aggregation from {} to {}", startTime, endTime);

        List<AggregationResult> results = rawRepository.aggregateDataByTimeRange(startTime, endTime);

        for (AggregationResult result : results) {
            Sensor sensor = sensorRepository.findById(result.getSensorId()).orElse(null);
            if (sensor == null) continue;

            SensorDataAggregated aggregated = SensorDataAggregated.builder()
                    .sensor(sensor)
                    .avgValue1(result.getAvgValue1() != null ? result.getAvgValue1().floatValue() : null)
                    .maxValue1(result.getMaxValue1() != null ? result.getMaxValue1().floatValue() : null)
                    .avgValue2(result.getAvgValue2() != null ? result.getAvgValue2().floatValue() : null)
                    .maxValue2(result.getMaxValue2() != null ? result.getMaxValue2().floatValue() : null)
                    .timeBucket(startTime) // Use the start of the hour as the bucket timestamp
                    .build();

            aggregatedRepository.save(aggregated);
        }

        log.info("Hourly data aggregation completed. Inserted {} records.", results.size());
    }

    /**
     * Executes every day at 02:00 AM.
     * Deletes raw data older than 7 days to prevent DB explosion.
     */
    @Scheduled(cron = "0 0 2 * * *")
    @Transactional
    public void cleanupOldRawData() {
        LocalDateTime cutoffTime = LocalDateTime.now().minusDays(7);
        log.info("Starting cleanup of raw data older than {}", cutoffTime);

        rawRepository.deleteOlderThan(cutoffTime);

        log.info("Cleanup of old raw data completed.");
    }
}
